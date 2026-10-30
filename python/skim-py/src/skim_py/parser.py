"""AST parsing and outline extraction for Python files."""

from __future__ import annotations
import ast
import os
import re
from pathlib import Path
from typing import Optional, List, Tuple

from .types import OutlineItem, ParsedFile, SyntaxNotice


TEST_DIR_NAMES = {"tests", "test", "testing", "__tests__"}
TEST_FILE_PATTERN = re.compile(r"^(test_.*|.*_test|conftest)\.py$", re.IGNORECASE)
TEST_CLASS_PATTERN = re.compile(r"^Test[A-Z0-9_].*")
TEST_FUNC_PATTERN = re.compile(r"^test(_|[A-Z0-9_]).*")
HEADER_DEF_PATTERN = re.compile(r"^\s*(async\s+def|def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)")


def get_indent(line: str) -> int:
    """Return indentation level expanding tabs to 8 spaces (CPython rule)."""
    expanded = line.expandtabs(8)
    return len(expanded) - len(expanded.lstrip(" "))


def get_block_end(lines: List[str], start: int) -> int:
    """Find the last indented code line, ignoring blank lines and comments."""
    indent = get_indent(lines[start])
    end = start
    for idx in range(start + 1, len(lines)):
        stripped = lines[idx].strip()
        if not stripped or stripped.startswith("#"):
            continue
        if get_indent(lines[idx]) <= indent:
            break
        end = idx
    return end


def split_source_lines(content: str, keepends: bool = False) -> List[str]:
    """Normalize newlines (\r\n, \r -> \n) and split into lines."""
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


def parse_source_file(file_path: str, content: str, include_tests: bool = False) -> ParsedFile:
    src_lines = split_source_lines(content, keepends=False)
    total_lines = len(src_lines)
    is_test = is_test_file(file_path)

    parsed = ParsedFile(
        file_path=file_path,
        total_lines=total_lines,
        is_test_file=is_test,
    )

    tree: Optional[ast.AST] = None
    salvaged_items: List[OutlineItem] = []
    masked_block_ends = {}
    stub_lines = set()
    masked_lines = set()

    try:
        tree = ast.parse(content, filename=file_path, type_comments=True)
    except SyntaxError as first_err:
        first_line = first_err.lineno or 1
        first_msg = first_err.msg or "syntax error"
        notice = SyntaxNotice(line=first_line, message=first_msg)
        parsed.syntax_errors.append(notice)

        # Fallback: Iterative line masking with up to 100 attempts
        working_lines = split_source_lines(content, keepends=True)
        seen_states = set()
        max_attempts = 100
        current_err: Optional[SyntaxError] = first_err

        for _ in range(max_attempts):
            if current_err is None:
                break
            lineno = current_err.lineno
            if lineno is None or lineno < 1 or lineno > len(working_lines):
                break

            line_idx = lineno - 1
            line = working_lines[line_idx]
            indent = get_indent(line)
            leading_ws = line[: len(line) - len(line.lstrip())]

            state_key = (line_idx, line)
            if state_key in seen_states:
                # Cannot make further progress by masking this line
                break
            seen_states.add(state_key)

            # Check if this line is a block header followed by an indented block.
            # E.g. broken def/class/if header whose masking would cause IndentationError cascades.
            end_idx = get_block_end(working_lines, line_idx)

            # Check if header matches def/async def/class
            m_hdr = HEADER_DEF_PATTERN.match(line)

            if end_idx > line_idx or m_hdr:
                # Update notice message with masked line range if not already suffixed
                mask_suffix = f"(L{line_idx + 1}-L{end_idx + 1} masked)"
                for n in parsed.syntax_errors:
                    if n.line == lineno and "masked)" not in n.message:
                        n.message = f"{n.message} {mask_suffix}"

                # Salvage header definition if it matches def/async def/class
                if m_hdr:
                    k_raw, name = m_hdr.group(1), m_hdr.group(2)
                    start_l = line_idx + 1
                    end_l = end_idx + 1

                    # Scan upward for leading decorators
                    decos = []
                    for d_idx in range(line_idx - 1, -1, -1):
                        prev_d = working_lines[d_idx]
                        stripped_d = prev_d.strip()
                        if stripped_d.startswith("@"):
                            start_l = d_idx + 1
                            decos.insert(0, stripped_d)
                        elif not stripped_d or stripped_d.startswith("#"):
                            continue
                        else:
                            break

                    deco_prefix = (" ".join(decos) + " ") if decos else ""

                    if k_raw == "class":
                        cls_is_test = bool(TEST_CLASS_PATTERN.match(name))
                        class_item = OutlineItem(
                            name=name,
                            kind="test" if cls_is_test else "class",
                            start_line=start_l,
                            end_line=end_l,
                            raw_header=f"{deco_prefix}class {name} [syntax error]",
                        )
                        # Extract child methods inside the unparsable class
                        k = line_idx + 1
                        while k <= end_idx:
                            m_ch = HEADER_DEF_PATTERN.match(working_lines[k])
                            if m_ch and m_ch.group(1) in ("def", "async def"):
                                ch_k_raw, ch_name = m_ch.group(1), m_ch.group(2)
                                ch_start = k + 1
                                # Scan upward for method decorators inside the class
                                ch_decos = []
                                for cj in range(k - 1, line_idx, -1):
                                    prev_cj = working_lines[cj]
                                    str_cj = prev_cj.strip()
                                    if str_cj.startswith("@"):
                                        ch_start = cj + 1
                                        ch_decos.insert(0, str_cj)
                                    elif not str_cj or str_cj.startswith("#"):
                                        continue
                                    else:
                                        break

                                ch_deco_prefix = (" ".join(ch_decos) + " ") if ch_decos else ""

                                ch_end_idx = min(get_block_end(working_lines, k), end_idx)
                                ch_end = ch_end_idx + 1
                                ch_is_test = bool(TEST_FUNC_PATTERN.match(ch_name))
                                ch_kind = "test" if ch_is_test else "method"
                                class_item.children.append(
                                    OutlineItem(
                                        name=ch_name,
                                        kind=ch_kind,
                                        start_line=ch_start,
                                        end_line=ch_end,
                                        raw_header=f"{ch_deco_prefix}{ch_k_raw} {ch_name}()",
                                        parent_name=name,
                                    )
                                )
                                k = ch_end_idx + 1
                            else:
                                k += 1

                        salvaged_items.append(class_item)
                    else:
                        fn_is_test = bool(TEST_FUNC_PATTERN.match(name))
                        fn_kind = "test" if fn_is_test else ("async def" if "async" in k_raw else "function")
                        # Check if method inside an outer class, skipping comments and blank lines
                        parent_cls = None
                        for p_idx in range(line_idx - 1, -1, -1):
                            prev_l = working_lines[p_idx]
                            stripped_p = prev_l.strip()
                            if not stripped_p or stripped_p.startswith("#"):
                                continue
                            if get_indent(prev_l) < indent:
                                m_p = re.match(r"^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)", prev_l)
                                if m_p:
                                    parent_cls = m_p.group(1)
                                break

                        salvaged_items.append(
                            OutlineItem(
                                name=name,
                                kind="test" if fn_is_test else ("method" if parent_cls else fn_kind),
                                start_line=start_l,
                                end_line=end_l,
                                raw_header=f"{deco_prefix}{k_raw} {name} [syntax error]",
                                parent_name=parent_cls,
                            )
                        )

            # Keep decorators attached to a harmless definition stub. Otherwise
            # use pass so masking the only statement does not empty its suite.
            if m_hdr:
                stub = (
                    "class __skim_masked__: pass\n"
                    if m_hdr.group(1) == "class"
                    else "def __skim_masked__(): pass\n"
                )
                working_lines[line_idx] = leading_ws + stub
                stub_lines.add(lineno)
            else:
                working_lines[line_idx] = leading_ws + "pass\n"
            for k in range(line_idx + 1, end_idx + 1):
                working_lines[k] = "# syntax error masked\n"

            masked_lines.update(range(line_idx + 1, end_idx + 2))
            masked_block_ends[lineno] = end_idx + 1

            try:
                tree = ast.parse("".join(working_lines), filename=file_path, type_comments=True)
                break  # Successful recovery!
            except SyntaxError as next_err:
                current_err = next_err
                # Only record distinct line notices
                if not any(n.line == next_err.lineno for n in parsed.syntax_errors):
                    parsed.syntax_errors.append(
                        SyntaxNotice(line=next_err.lineno or 1, message=next_err.msg or "syntax error")
                    )
            except Exception:
                break
    except Exception as e:
        parsed.syntax_errors.append(
            SyntaxNotice(line=1, message=str(e))
        )
        return parsed

    parsed.masked_lines = sorted(masked_lines)

    def recovered_end(node: ast.AST) -> int:
        end = get_end_line(node)
        return max([end] + [
            masked_end for start, masked_end in masked_block_ends.items()
            if node.lineno <= start <= end
        ])

    def merge_salvaged() -> None:
        if not salvaged_items:
            return
        for s_item in salvaged_items:
            # The AST still contains excluded test classes, but parsed.items
            # does not. Do not promote their recovered methods to top level.
            if not include_tests and any(
                start <= s_item.start_line <= end
                for start, end in parsed.test_ranges
            ):
                continue
            # Check test filtering for salvaged items
            if s_item.kind == "test":
                parsed.test_ranges.append((s_item.start_line, s_item.end_line))
                if not include_tests:
                    continue

            if s_item.parent_name:
                parent = next(
                    (it for it in parsed.items
                     if it.name == s_item.parent_name and it.kind in ("class", "test")
                     and it.start_line <= s_item.start_line <= it.end_line),
                    None,
                )
                if parent:
                    parent.children.append(s_item)
                    parent.children.sort(key=lambda ch: ch.start_line)
                    parent.end_line = max(parent.end_line, s_item.end_line)
                else:
                    parsed.items.append(s_item)
            else:
                # If s_item is a class, filter its child test methods if include_tests is False
                if s_item.kind in ("class", "test"):
                    filtered_children = []
                    for ch in s_item.children:
                        if ch.kind == "test":
                            parsed.test_ranges.append((ch.start_line, ch.end_line))
                            if not include_tests:
                                continue
                        filtered_children.append(ch)
                    s_item.children = filtered_children

                parsed.items.append(s_item)

        parsed.items.sort(key=lambda it: it.start_line)

    if tree is None:
        merge_salvaged()
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
        # Skip internal mask stubs
        if node.lineno in stub_lines:
            continue

        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            is_async = isinstance(node, ast.AsyncFunctionDef)
            is_test_fn = is_test_func(node)
            start_l = get_start_line(node)
            end_l = recovered_end(node)

            if is_test_fn:
                parsed.test_ranges.append((start_l, end_l))
                if not include_tests:
                    continue

            kind = "test" if is_test_fn else ("async def" if is_async else "function")
            sig = get_fn_signature(node, is_async=is_async)

            # Prepend decorators in signature if any
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
            end_l = recovered_end(node)

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
                if child.lineno in stub_lines:
                    continue

                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    child_async = isinstance(child, ast.AsyncFunctionDef)
                    child_test = is_test_func(child)
                    ch_start = get_start_line(child)
                    ch_end = recovered_end(child)

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
            # Top-level annotated constant / variable
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
            # Top-level simple constant (e.g. UPPER_CASE = ...)
            # Only record if simple uppercase variable or type-like
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

    merge_salvaged()
    return parsed
