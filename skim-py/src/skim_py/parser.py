"""AST parsing and outline extraction for Python files."""

from __future__ import annotations
import ast
import re
from pathlib import Path
from typing import Optional, List

from .types import OutlineItem, ParsedFile, SyntaxNotice


TEST_DIR_NAMES = {"tests", "test", "testing", "__tests__"}
TEST_FILE_PATTERN = re.compile(r"^(test_.*|.*_test|conftest)\.py$", re.IGNORECASE)
TEST_CLASS_PATTERN = re.compile(r"^Test[A-Z0-9_].*")
TEST_FUNC_PATTERN = re.compile(r"^test(_|[A-Z0-9_]).*")


def split_source_lines(content: str, keepends: bool = False) -> List[str]:
    """Normalize newlines (\\r\\n, \\r -> \\n) and split into lines."""
    norm = content.replace("\r\n", "\n").replace("\r", "\n")
    if not norm:
        return []
    raw = norm.split("\n")
    if norm.endswith("\n"):
        raw = raw[:-1]
        if keepends:
            return [l + "\n" for l in raw]
        return raw
    if keepends:
        return [l + "\n" for l in raw[:-1]] + [raw[-1]]
    return raw


def is_test_file(file_path: str) -> bool:
    p = Path(file_path)
    if TEST_FILE_PATTERN.match(p.name):
        return True
    for part in p.parts[:-1]:
        if part.lower() in TEST_DIR_NAMES:
            return True
    return False


def get_start_line(node: ast.AST) -> int:
    """Return the 1-based start line, including decorators if present."""
    if hasattr(node, "decorator_list") and node.decorator_list:
        return node.decorator_list[0].lineno
    return getattr(node, "lineno", 1)


def get_end_line(node: ast.AST) -> int:
    """Return the 1-based end line."""
    return getattr(node, "end_lineno", get_start_line(node))


def get_fn_signature(node: ast.FunctionDef | ast.AsyncFunctionDef, is_async: bool = False) -> str:
    prefix = "async def" if is_async else "def"
    type_params = ""
    if hasattr(node, "type_params") and node.type_params:
        params_str = ", ".join(ast.unparse(tp) for tp in node.type_params)
        type_params = f"[{params_str}]"
    args_str = ast.unparse(node.args)
    returns_str = f" -> {ast.unparse(node.returns)}" if node.returns else ""
    return f"{prefix} {node.name}{type_params}({args_str}){returns_str}"


def get_class_signature(node: ast.ClassDef) -> str:
    type_params = ""
    if hasattr(node, "type_params") and node.type_params:
        params_str = ", ".join(ast.unparse(tp) for tp in node.type_params)
        type_params = f"[{params_str}]"
    bases = [ast.unparse(b) for b in node.bases]
    for kw in node.keywords:
        if kw.arg:
            bases.append(f"{kw.arg}={ast.unparse(kw.value)}")
        else:
            bases.append(f"**{ast.unparse(kw.value)}")
    bases_str = f"({', '.join(bases)})" if bases else ""
    return f"class {node.name}{type_params}{bases_str}"


def is_test_class(node: ast.ClassDef) -> bool:
    if TEST_CLASS_PATTERN.match(node.name):
        return True
    for base in node.bases:
        base_name = ast.unparse(base)
        if "TestCase" in base_name:
            return True
    return False


def is_test_func(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    return bool(TEST_FUNC_PATTERN.match(node.name))


# ---------------------------------------------------------------------------
# Fallback Pass (Error Recovery — parso CST)
# ---------------------------------------------------------------------------

def _parso_code_one_line(node) -> str:
    """Render CST tokens without comments or layout from their prefixes.

    Keep token values intact (notably whitespace inside string literals).
    """
    parts: List[str] = []

    def visit(current):
        if hasattr(current, "children"):
            for child in current.children:
                visit(child)
        elif current.type not in ("newline", "endmarker"):
            if parts and current.prefix:
                parts.append(" ")
            parts.append(current.value)

    visit(node)
    return "".join(parts).strip()


def get_parso_decorators(node) -> List[str]:
    decos: List[str] = []
    for child in getattr(node, "children", []):
        if child.type == "decorator":
            decos.append(_parso_code_one_line(child))
        elif child.type == "decorators":
            for d in child.children:
                if d.type == "decorator":
                    decos.append(_parso_code_one_line(d))
    return decos


def get_parso_end_line(node) -> int:
    leaf = node.get_last_leaf()
    if leaf is None:
        return node.end_pos[0]
    if leaf.type == "newline" or leaf.value in ("\n", "\r\n"):
        return max(node.start_pos[0], leaf.start_pos[0])
    if node.end_pos[1] == 0 and node.end_pos[0] > node.start_pos[0]:
        return node.end_pos[0] - 1
    return node.end_pos[0]


def get_parso_fn_signature(fn_node, is_async: bool = False, decos: Optional[List[str]] = None) -> str:
    header_parts = []
    for c in fn_node.children:
        if c.type == "suite" or (c.type == "operator" and c.value == ":"):
            break
        if header_parts and c.get_first_leaf().prefix:
            header_parts.append(" ")
        header_parts.append(_parso_code_one_line(c))
    raw = "".join(header_parts)
    if is_async and not raw.startswith("async "):
        raw = f"async {raw}"
    if decos:
        raw = " ".join(decos) + " " + raw
    return raw


def get_parso_class_signature(cls_node, decos: Optional[List[str]] = None) -> str:
    return get_parso_fn_signature(cls_node, decos=decos)


def _parso_recovery_end(siblings, index: int) -> tuple[int, int]:
    """Include all indented CST siblings in a broken declaration's body."""
    node = siblings[index]
    end_line = get_parso_end_line(node)
    next_index = index + 1
    while next_index < len(siblings):
        following = siblings[next_index]
        if following.type == "newline":
            next_index += 1
            continue
        if following.type == "endmarker" or following.start_pos[1] <= node.start_pos[1]:
            break
        end_line = max(end_line, get_parso_end_line(following))
        next_index += 1
    return end_line, next_index


def _extract_methods_from_parso_node(node, expected_col: int, parent_name: str) -> List[OutlineItem]:
    methods: List[OutlineItem] = []
    decos: List[str] = []
    target = node
    if node.type == "decorated":
        decos = get_parso_decorators(node)
        target = node.children[-1]

    is_async = False
    fn = None
    if target.type == "funcdef":
        fn = target
    elif target.type in ("async_stmt", "async_funcdef"):
        is_async = True
        for c in target.children:
            if c.type == "funcdef":
                fn = c
                break

    if fn and hasattr(fn, "name") and node.start_pos[1] == expected_col:
        m_name = fn.name.value
        m_start = node.start_pos[0]
        m_end = get_parso_end_line(node)
        m_sig = get_parso_fn_signature(fn, is_async=is_async, decos=decos)
        is_t = bool(TEST_FUNC_PATTERN.match(m_name))
        methods.append(
            OutlineItem(
                name=m_name,
                kind="test" if is_t else "method",
                start_line=m_start,
                end_line=m_end,
                raw_header=m_sig,
                parent_name=parent_name,
            )
        )
        suite = next((c for c in fn.children if c.type == "suite"), None)
        if suite:
            for s in suite.children:
                methods.extend(_extract_methods_from_parso_node(s, expected_col, parent_name))
    return methods


def _parse_fallback_parso(
    file_path: str,
    content: str,
    total_lines: int,
    is_test: bool,
    first_err: SyntaxError,
    include_tests: bool = False,
) -> ParsedFile:
    import parso

    parsed = ParsedFile(
        file_path=file_path,
        total_lines=total_lines,
        is_test_file=is_test,
    )

    # 1. Grammar & Parse
    # Use the newest grammar shipped by our minimum Parso version, even on
    # older interpreters, so recovery recognizes modern declarations.
    grammar = parso.load_grammar(version="3.14")

    tree = grammar.parse(content)

    # 2. Syntax notices collection
    first_line = first_err.lineno or 1
    first_msg = first_err.msg or "syntax error"
    seen_lines = {first_line}
    parsed.syntax_errors.append(SyntaxNotice(line=first_line, message=first_msg))

    is_unclosed_construct = any(
        phrase in first_msg for phrase in ("was never closed", "unclosed", "EOF while scanning")
    )

    # Parso can blame the first valid token *after* an unclosed construct.
    # Suppress those boundary diagnostics, not errors inside surviving blocks.
    declaration_positions = set()

    def collect_declaration_positions(node):
        if node.type in ("funcdef", "classdef", "async_stmt", "async_funcdef"):
            declaration_positions.add(node.start_pos)
        for child in getattr(node, "children", []):
            collect_declaration_positions(child)

    collect_declaration_positions(tree)
    raw_additional_errors: List[tuple[int, str]] = []
    for err in grammar.iter_errors(tree):
        line = err.start_pos[0]
        msg = err.message.removeprefix("SyntaxError: ")
        if (
            is_unclosed_construct
            and msg == "invalid syntax"
            and err.start_pos in declaration_positions
        ):
            continue
        if line not in seen_lines and 1 <= line <= max(1, total_lines):
            seen_lines.add(line)
            raw_additional_errors.append((line, msg))

    # 3. Outline extraction from CST
    children = tree.children
    i = 0
    n_children = len(children)
    salvaged_error_spans: List[tuple[int, int]] = []
    type_alias_spans: List[tuple[int, int]] = []

    while i < n_children:
        child = children[i]
        if child.type == "endmarker":
            break

        # Check for PEP 695 type alias: error_node 'type' followed by simple_stmt
        if child.type == "error_node" and child.get_code().strip() == "type":
            if i + 1 < n_children and children[i + 1].type == "simple_stmt":
                stmt = children[i + 1]
                for s in stmt.children:
                    if s.type == "expr_stmt":
                        t_raw = _parso_code_one_line(s.children[0])
                        t_name = t_raw.split("[")[0].strip()
                        t_val = _parso_code_one_line(s.children[-1])
                        start_l = child.start_pos[0]
                        end_l = get_parso_end_line(stmt)
                        type_alias_spans.append((start_l, end_l))
                        parsed.items.append(
                            OutlineItem(
                                name=t_name,
                                kind="type",
                                start_line=start_l,
                                end_line=end_l,
                                raw_header=f"type {t_raw} = {t_val}",
                            )
                        )
                i += 2
                continue

        decos: List[str] = []
        target = child
        if child.type == "decorated":
            decos = get_parso_decorators(child)
            target = child.children[-1]

        # Top-level simple statements: imports, variables
        if child.type == "simple_stmt":
            is_import = False
            for s in child.children:
                if s.type in ("import_name", "import_from"):
                    is_import = True
                    parsed.imports.append(child.get_code().strip())
                    break
            if is_import:
                i += 1
                continue

            for s in child.children:
                if s.type == "expr_stmt":
                    target_name = s.children[0].get_code().strip()
                    code_text = s.get_code().strip()
                    if ":" in code_text or target_name.isupper() or target_name.startswith("__"):
                        start_l = child.start_pos[0]
                        end_l = get_parso_end_line(child)
                        parsed.items.append(
                            OutlineItem(
                                name=target_name.split(":")[0].strip(),
                                kind="var",
                                start_line=start_l,
                                end_line=end_l,
                                raw_header=code_text,
                            )
                        )
            i += 1
            continue

        # Top-level functions & async functions
        if target.type in ("funcdef", "async_stmt", "async_funcdef"):
            is_async = False
            fn = None
            if target.type == "funcdef":
                fn = target
            elif target.type in ("async_stmt", "async_funcdef"):
                is_async = True
                for c in target.children:
                    if c.type == "funcdef":
                        fn = c
                        break

            if fn and hasattr(fn, "name"):
                name = fn.name.value
                start_l = child.start_pos[0]
                end_l = get_parso_end_line(child)
                sig = get_parso_fn_signature(fn, is_async=is_async, decos=decos)
                is_test_fn = bool(TEST_FUNC_PATTERN.match(name))
                kind = "test" if is_test_fn else ("async def" if is_async else "function")

                if is_test_fn:
                    parsed.test_ranges.append((start_l, end_l))
                    if not include_tests:
                        i += 1
                        continue

                parsed.items.append(
                    OutlineItem(
                        name=name,
                        kind=kind,
                        start_line=start_l,
                        end_line=end_l,
                        raw_header=sig,
                    )
                )
            i += 1
            continue

        # Top-level classes
        if target.type == "classdef":
            name = target.name.value
            start_l = child.start_pos[0]
            end_l = get_parso_end_line(child)
            sig = get_parso_class_signature(target, decos=decos)
            is_test_cls = bool(TEST_CLASS_PATTERN.match(name))
            in_bases = False
            for c in target.children:
                if c.type == "operator" and c.value == "(":
                    in_bases = True
                elif c.type == "operator" and c.value == ")":
                    break
                elif in_bases and "TestCase" in c.get_code(include_prefix=False):
                    is_test_cls = True
                    break

            if is_test_cls:
                parsed.test_ranges.append((start_l, end_l))
                if not include_tests:
                    i += 1
                    continue

            class_item = OutlineItem(
                name=name,
                kind="test" if is_test_cls else "class",
                start_line=start_l,
                end_line=end_l,
                raw_header=sig,
            )

            suite = next((c for c in target.children if c.type == "suite"), None)
            if suite:
                s_idx = 0
                suite_children = suite.children
                while s_idx < len(suite_children):
                    s = suite_children[s_idx]
                    s_decos: List[str] = []
                    s_target = s
                    if s.type == "decorated":
                        s_decos = get_parso_decorators(s)
                        s_target = s.children[-1]

                    if s_target.type in ("funcdef", "async_stmt", "async_funcdef"):
                        m_is_async = False
                        m_fn = None
                        if s_target.type == "funcdef":
                            m_fn = s_target
                        elif s_target.type in ("async_stmt", "async_funcdef"):
                            m_is_async = True
                            for c in s_target.children:
                                if c.type == "funcdef":
                                    m_fn = c
                                    break
                        if m_fn and hasattr(m_fn, "name"):
                            m_name = m_fn.name.value
                            m_start = s.start_pos[0]
                            m_end = get_parso_end_line(s)
                            m_sig = get_parso_fn_signature(m_fn, is_async=m_is_async, decos=s_decos)
                            m_test = bool(TEST_FUNC_PATTERN.match(m_name))

                            if m_test:
                                parsed.test_ranges.append((m_start, m_end))
                                if not include_tests:
                                    s_idx += 1
                                    continue

                            class_item.children.append(
                                OutlineItem(
                                    name=m_name,
                                    kind="test" if m_test else "method",
                                    start_line=m_start,
                                    end_line=m_end,
                                    raw_header=m_sig,
                                    parent_name=name,
                                )
                            )
                        s_idx += 1
                    elif s.type == "simple_stmt":
                        for expr in s.children:
                            if expr.type == "expr_stmt":
                                class_item.fields_or_variants.append(expr.get_code().strip())
                        s_idx += 1
                    elif s.type == "error_node":
                        s_decos = get_parso_decorators(s)
                        kw = None
                        nm = None
                        is_as = False
                        for sub in s.children:
                            if sub.type == "keyword":
                                if sub.value == "async":
                                    is_as = True
                                elif sub.value in ("def", "class"):
                                    kw = sub.value
                            elif kw and sub.type == "name":
                                nm = sub.value
                                break
                        if kw and nm:
                            m_start = s.start_pos[0]
                            m_end = get_parso_end_line(s)
                            prefix = "async def" if is_as else "def"
                            deco_p = (" ".join(s_decos) + " ") if s_decos else ""
                            m_test = bool(TEST_FUNC_PATTERN.match(nm))

                            m_end, s_idx = _parso_recovery_end(suite_children, s_idx)

                            salvaged_error_spans.append((m_start, m_end))
                            class_item.end_line = max(class_item.end_line, m_end)

                            if m_test:
                                parsed.test_ranges.append((m_start, m_end))
                                if not include_tests:
                                    continue
                            class_item.children.append(
                                OutlineItem(
                                    name=nm,
                                    kind="test" if m_test else "method",
                                    start_line=m_start,
                                    end_line=m_end,
                                    raw_header=f"{deco_p}{prefix} {nm}() [syntax error]",
                                    parent_name=name,
                                )
                            )
                        else:
                            s_idx += 1
                    else:
                        s_idx += 1

            parsed.items.append(class_item)
            i += 1
            continue

        # Top-level error nodes (salvaging broken def/class)
        if child.type == "error_node":
            decos = get_parso_decorators(child)
            kw = None
            nm = None
            is_async_hdr = False
            for sub in child.children:
                if sub.type == "keyword":
                    if sub.value == "async":
                        is_async_hdr = True
                    elif sub.value in ("def", "class"):
                        kw = sub.value
                elif kw and sub.type == "name":
                    nm = sub.value
                    break

            if kw and nm:
                start_l = child.start_pos[0]
                end_l = get_parso_end_line(child)
                deco_prefix = (" ".join(decos) + " ") if decos else ""

                if kw == "class":
                    is_test_cls = bool(TEST_CLASS_PATTERN.match(nm))
                    class_item = OutlineItem(
                        name=nm,
                        kind="test" if is_test_cls else "class",
                        start_line=start_l,
                        end_line=end_l,
                        raw_header=f"{deco_prefix}class {nm} [syntax error]",
                    )

                    # Gather subsequent child methods that belong to this class by indentation
                    j = i + 1
                    child_methods = []
                    while j < n_children:
                        next_ch = children[j]
                        if next_ch.type == "endmarker":
                            break
                        if next_ch.start_pos[1] > child.start_pos[1]:
                            m_items = _extract_methods_from_parso_node(next_ch, next_ch.start_pos[1], nm)
                            if m_items:
                                child_methods.extend(m_items)
                                end_l = max(end_l, m_items[-1].end_line)
                            else:
                                end_l = max(end_l, get_parso_end_line(next_ch))
                            j += 1
                        else:
                            break

                    for idx, m in enumerate(child_methods):
                        if idx + 1 < len(child_methods):
                            m.end_line = min(m.end_line, child_methods[idx + 1].start_line - 1)
                        if m.kind == "test":
                            parsed.test_ranges.append((m.start_line, m.end_line))
                            if not include_tests:
                                continue
                        class_item.children.append(m)

                    class_item.end_line = end_l
                    salvaged_error_spans.append((start_l, end_l))

                    if is_test_cls:
                        parsed.test_ranges.append((start_l, end_l))
                        if not include_tests:
                            i = j
                            continue

                    parsed.items.append(class_item)
                    i = j
                    continue
                else:
                    # Broken function header
                    is_test_fn = bool(TEST_FUNC_PATTERN.match(nm))
                    prefix = "async def" if is_async_hdr else "def"
                    fn_kind = "test" if is_test_fn else ("async def" if is_async_hdr else "function")

                    end_l, j = _parso_recovery_end(children, i)

                    salvaged_error_spans.append((start_l, end_l))

                    if is_test_fn:
                        parsed.test_ranges.append((start_l, end_l))
                        if not include_tests:
                            i = j
                            continue

                    parsed.items.append(
                        OutlineItem(
                            name=nm,
                            kind=fn_kind,
                            start_line=start_l,
                            end_line=end_l,
                            raw_header=f"{deco_prefix}{prefix} {nm}() [syntax error]",
                        )
                    )
                    i = j
                    continue

        i += 1

    # Hide recovery cascades within broken headers/bodies and Parso's false
    # diagnostics for the type aliases reconstructed above.
    suppressed_spans = salvaged_error_spans + type_alias_spans
    for err_line, err_msg in raw_additional_errors:
        if not any(s <= err_line <= e for s, e in suppressed_spans):
            parsed.syntax_errors.append(SyntaxNotice(line=err_line, message=err_msg))

    parsed.syntax_errors.sort(key=lambda s: s.line)
    parsed.items.sort(key=lambda it: it.start_line)
    return parsed


# ---------------------------------------------------------------------------
# Primary Pass (Fast Path — ast.AST)
# ---------------------------------------------------------------------------

def parse_source_file(file_path: str, content: str, include_tests: bool = False) -> ParsedFile:
    src_lines = split_source_lines(content, keepends=False)
    total_lines = len(src_lines)
    is_test = is_test_file(file_path)

    parsed = ParsedFile(
        file_path=file_path,
        total_lines=total_lines,
        is_test_file=is_test,
    )

    try:
        tree = ast.parse(content, filename=file_path, type_comments=True)
    except SyntaxError as first_err:
        return _parse_fallback_parso(
            file_path=file_path,
            content=content,
            total_lines=total_lines,
            is_test=is_test,
            first_err=first_err,
            include_tests=include_tests,
        )
    except Exception as e:
        parsed.syntax_errors.append(
            SyntaxNotice(line=1, message=str(e))
        )
        return parsed

    # 1. Collect imports
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            start = (node.lineno or 1) - 1
            end = node.end_lineno or (start + 1)
            raw_imp = "\n".join(src_lines[start:end])
            parsed.imports.append(raw_imp)

    # 2. Extract outline items
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            is_async = isinstance(node, ast.AsyncFunctionDef)
            is_test_fn = is_test_func(node)
            start_l = get_start_line(node)
            end_l = get_end_line(node)

            if is_test_fn:
                parsed.test_ranges.append((start_l, end_l))
                if not include_tests:
                    continue

            kind = "test" if is_test_fn else ("async def" if is_async else "function")
            sig = get_fn_signature(node, is_async=is_async)

            if node.decorator_list:
                decos = ["@" + ast.unparse(d) for d in node.decorator_list]
                sig = " ".join(decos) + " " + sig

            item = OutlineItem(
                name=node.name,
                kind=kind,
                start_line=start_l,
                end_line=end_l,
                raw_header=sig,
            )
            parsed.items.append(item)

        elif isinstance(node, ast.ClassDef):
            is_test_cls = is_test_class(node)
            start_l = get_start_line(node)
            end_l = get_end_line(node)

            if is_test_cls:
                parsed.test_ranges.append((start_l, end_l))
                if not include_tests:
                    continue

            class_sig = get_class_signature(node)
            if node.decorator_list:
                decos = ["@" + ast.unparse(d) for d in node.decorator_list]
                class_sig = " ".join(decos) + " " + class_sig

            class_item = OutlineItem(
                name=node.name,
                kind="test" if is_test_cls else "class",
                start_line=start_l,
                end_line=end_l,
                raw_header=class_sig,
            )

            # Process class body
            for child in node.body:
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    child_async = isinstance(child, ast.AsyncFunctionDef)
                    child_test = is_test_func(child)
                    ch_start = get_start_line(child)
                    ch_end = get_end_line(child)

                    if child_test:
                        parsed.test_ranges.append((ch_start, ch_end))
                        if not include_tests:
                            continue

                    ch_sig = get_fn_signature(child, is_async=child_async)
                    if child.decorator_list:
                        decos = ["@" + ast.unparse(d) for d in child.decorator_list]
                        ch_sig = " ".join(decos) + " " + ch_sig

                    method_item = OutlineItem(
                        name=child.name,
                        kind="test" if child_test else "method",
                        start_line=ch_start,
                        end_line=ch_end,
                        raw_header=ch_sig,
                        parent_name=node.name,
                    )
                    class_item.children.append(method_item)

                elif isinstance(child, ast.AnnAssign):
                    val_str = f" = {ast.unparse(child.value)}" if child.value else ""
                    class_item.fields_or_variants.append(
                        f"{ast.unparse(child.target)}: {ast.unparse(child.annotation)}{val_str}"
                    )
                elif isinstance(child, ast.Assign):
                    for target in child.targets:
                        class_item.fields_or_variants.append(
                            f"{ast.unparse(target)} = {ast.unparse(child.value)}"
                        )

            parsed.items.append(class_item)

        elif getattr(ast, "TypeAlias", None) and isinstance(node, ast.TypeAlias):  # PEP 695 type X = ...
            start_l = get_start_line(node)
            end_l = get_end_line(node)
            sig = f"type {ast.unparse(node.name)} = {ast.unparse(node.value)}"
            parsed.items.append(
                OutlineItem(
                    name=ast.unparse(node.name),
                    kind="type",
                    start_line=start_l,
                    end_line=end_l,
                    raw_header=sig,
                )
            )

        elif isinstance(node, ast.AnnAssign):
            name = ast.unparse(node.target)
            start_l = get_start_line(node)
            end_l = get_end_line(node)
            val_str = f" = {ast.unparse(node.value)}" if node.value else ""
            sig = f"{name}: {ast.unparse(node.annotation)}{val_str}"
            parsed.items.append(
                OutlineItem(
                    name=name,
                    kind="var",
                    start_line=start_l,
                    end_line=end_l,
                    raw_header=sig,
                )
            )

        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and (target.id.isupper() or target.id.startswith("__")):
                    name = target.id
                    start_l = get_start_line(node)
                    end_l = get_end_line(node)
                    sig = f"{name} = {ast.unparse(node.value)}"
                    parsed.items.append(
                        OutlineItem(
                            name=name,
                            kind="var",
                            start_line=start_l,
                            end_line=end_l,
                            raw_header=sig,
                        )
                    )

    parsed.items.sort(key=lambda it: it.start_line)
    return parsed
