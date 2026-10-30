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
    src_lines = content.splitlines()
    total_lines = len(src_lines)
    is_test = is_test_file(file_path)

    parsed = ParsedFile(
        file_path=file_path,
        total_lines=total_lines,
        is_test_file=is_test,
    )

    tree: Optional[ast.AST] = None
    try:
        tree = ast.parse(content, filename=file_path, type_comments=True)
    except SyntaxError as first_err:
        parsed.syntax_errors.append(
            SyntaxNotice(line=first_err.lineno or 1, message=first_err.msg or "syntax error")
        )
        # Fallback: Iterative line masking with up to 100 attempts
        working_lines = content.splitlines(keepends=True)
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
            indent = len(line) - len(line.lstrip())

            state_key = (line_idx, line)
            if state_key in seen_states:
                # Cannot make further progress by masking this line
                break
            seen_states.add(state_key)

            if "# syntax error masked" not in line:
                working_lines[line_idx] = " " * indent + "# syntax error masked\n"
            else:
                working_lines[line_idx] = " " * indent + "pass\n"

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

    if tree is None:
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

    return parsed
