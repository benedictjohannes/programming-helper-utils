"""glance subcommand implementation for skim-py."""

from __future__ import annotations
import os
import sys
import glob
from pathlib import Path
from typing import List, Optional

from .types import OutlineItem, ParsedFile
from .parser import parse_source_file, is_test_file


IGNORED_DIRS = {
    ".git",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "dist",
    "build",
    ".tox",
    ".eggs",
}

SUPPORTED_EXTS = {".py", ".pyi"}


def is_supported_file(path_str: str) -> bool:
    return Path(path_str).suffix.lower() in SUPPORTED_EXTS


def find_files_recursively(dir_path: str, include_tests: bool) -> List[str]:
    results: List[str] = []
    try:
        with os.scandir(dir_path) as it:
            for entry in it:
                if entry.is_dir(follow_symlinks=False):
                    if entry.name in IGNORED_DIRS:
                        continue
                    if not include_tests and entry.name.lower() in {"tests", "test", "testing", "__tests__"}:
                        continue
                    results.extend(find_files_recursively(entry.path, include_tests))
                elif entry.is_file(follow_symlinks=False):
                    if is_supported_file(entry.name):
                        if not include_tests and is_test_file(entry.path):
                            continue
                        results.append(entry.path)
    except (PermissionError, FileNotFoundError) as err:
        sys.stderr.write(f"Warning: error reading directory {dir_path}: {err}\n")
    return results


def collect_files(targets: List[str], include_tests: bool) -> List[str]:
    files: List[str] = []
    for target in targets:
        p = Path(target)
        if p.exists():
            if p.is_dir():
                files.extend(find_files_recursively(str(p), include_tests))
            elif p.is_file():
                if is_supported_file(str(p)):
                    # When an explicit file path is directly supplied, always include it
                    files.append(str(p))
        elif any(char in target for char in "*?[]"):
            matches = glob.glob(target, recursive=True)
            for m in matches:
                if is_supported_file(m):
                    if include_tests or not is_test_file(m):
                        files.append(m)
        else:
            sys.stderr.write(f"Warning: path not found: {target}\n")

    unique = sorted(set(os.path.normpath(f) for f in files))
    return unique


def item_matches_filters(item: OutlineItem, content: str, lines: List[str], filters: List[str]) -> bool:
    if not filters:
        return True
    block_text = "\n".join(lines[item.start_line - 1 : item.end_line]).lower()
    return all(f.lower() in block_text for f in filters)


def has_child_matching(item: OutlineItem, content: str, lines: List[str], filters: List[str]) -> bool:
    if not filters:
        return True
    for ch in item.children:
        if item_matches_filters(ch, content, lines, filters) or has_child_matching(ch, content, lines, filters):
            return True
    return False


def run_glance(
    targets: List[str],
    signatures: bool = False,
    details: bool = False,
    uses: bool = False,
    filters: Optional[List[str]] = None,
    include_tests: bool = False,
) -> int:
    filters = filters or []
    files = collect_files(targets, include_tests)

    if not files:
        sys.stderr.write("Error: no Python files found matching input.\n")
        return 1

    printed_count = 0
    cwd = os.getcwd()

    for file_path in files:
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception as err:
            sys.stderr.write(f"Error reading {file_path}: {err}\n")
            continue

        src_lines = content.splitlines()
        parsed = parse_source_file(file_path, content, include_tests=include_tests)

        if filters:
            has_match = any(
                item_matches_filters(it, content, src_lines, filters)
                or has_child_matching(it, content, src_lines, filters)
                for it in parsed.items
            )
            if not has_match and not parsed.syntax_errors:
                continue

        if printed_count > 0:
            print("\n" + "=" * 70 + "\n")
        printed_count += 1

        test_info = ""
        if parsed.is_test_file and include_tests:
            test_info = " [test]"
        elif parsed.test_ranges and not include_tests:
            tr_desc = ", ".join(f"{s}..{e}" for s, e in parsed.test_ranges)
            test_info = f" [tests skipped: {tr_desc}]"

        error_tag = ""
        if parsed.syntax_errors:
            n = len(parsed.syntax_errors)
            error_tag = " [! 1 syntax error]" if n == 1 else f" [! {n} syntax errors]"

        try:
            rel_path = os.path.relpath(file_path, cwd)
        except ValueError:
            rel_path = file_path

        print(f"=== {rel_path} ({parsed.total_lines} lines){test_info}{error_tag} ===")

        for err in parsed.syntax_errors:
            print(f"  Syntax Notice: L{err.line}: {err.message}")

        if uses:
            if parsed.imports:
                print("\nImports:")
                for imp in parsed.imports:
                    for line in imp.splitlines():
                        print(f"  {line}")
            else:
                print("\nImports: (none)")

        print("\nOutline:")

        def render_tree(items: List[OutlineItem], depth: int = 0) -> None:
            for it in items:
                matches = item_matches_filters(it, content, src_lines, filters)
                child_matches = has_child_matching(it, content, src_lines, filters)
                if not matches and not child_matches:
                    continue

                span = f"L{it.start_line}-L{it.end_line}"
                if it.kind == "test":
                    label = it.raw_header
                elif signatures:
                    label = it.raw_header
                else:
                    label = f"{it.kind} {it.name}"

                child_indent = "  " * depth
                span_padded = span.ljust(12)
                print(f"  {span_padded} {child_indent}{label}")

                if it.fields_or_variants and details:
                    f_indent = " " * (17 + depth * 2)
                    for fv in it.fields_or_variants:
                        print(f"{f_indent}| {fv}")

                methods_or_subitems = [ch for ch in it.children if ch.kind in {"method", "test"}]
                if methods_or_subitems:
                    render_tree(methods_or_subitems, depth + 1)

        render_tree(parsed.items)

    return 0
