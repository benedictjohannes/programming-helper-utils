"""block subcommand implementation for skim-py."""

from __future__ import annotations
import os
import sys
from pathlib import Path
from typing import List, Optional

from .types import OutlineItem, ParsedFile
from .parser import parse_source_file


def collect_all_items(items: List[OutlineItem]) -> List[OutlineItem]:
    res: List[OutlineItem] = []
    for it in items:
        res.append(it)
        if it.children:
            res.extend(collect_all_items(it.children))
    return res


def run_block(
    file_path: str,
    target: str,
    raw: bool = False,
    include_tests: bool = False,
) -> int:
    p = Path(file_path)
    if not p.exists():
        sys.stderr.write(f"Error: file not found: {file_path}\n")
        return 1

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as err:
        sys.stderr.write(f"Error reading {file_path}: {err}\n")
        return 1

    parsed = parse_source_file(file_path, content, include_tests=include_tests)
    all_items = collect_all_items(parsed.items)

    matches: List[OutlineItem] = []

    if "." in target:
        dot_idx = target.index(".")
        parent_target = target[:dot_idx]
        child_target = target[dot_idx + 1 :]

        parent_candidates = [it for it in all_items if it.parent_name is not None]

        # Tier 1: Exact case match on both parent and child
        exact_matches = [
            it
            for it in parent_candidates
            if it.parent_name == parent_target and it.name == child_target
        ]

        if exact_matches:
            matches = exact_matches
        else:
            # Tier 2: Case-insensitive match on both parent and child
            p_lower = parent_target.lower()
            c_lower = child_target.lower()
            case_matches = [
                it
                for it in parent_candidates
                if it.parent_name.lower() == p_lower and it.name.lower() == c_lower
            ]

            if case_matches:
                matches = case_matches
            else:
                # Tier 3: Substring search
                matches = [
                    it
                    for it in parent_candidates
                    if p_lower in it.parent_name.lower()
                    and (c_lower in it.name.lower() or c_lower in it.raw_header.lower())
                ]
    else:
        # Standalone identifier
        # Tier 1: Exact match on name
        exact_matches = [it for it in all_items if it.name == target]

        if exact_matches:
            matches = exact_matches
        else:
            # Tier 2: Case-insensitive match on name
            t_lower = target.lower()
            case_matches = [it for it in all_items if it.name.lower() == t_lower]

            if case_matches:
                matches = case_matches
            else:
                # Tier 3: Case-insensitive substring match
                matches = [
                    it
                    for it in all_items
                    if t_lower in it.name.lower() or t_lower in it.raw_header.lower()
                ]

    cwd = os.getcwd()
    try:
        rel_path = os.path.relpath(file_path, cwd)
    except ValueError:
        rel_path = file_path

    if not matches:
        sys.stderr.write(f"Error: block '{target}' not found in {rel_path}\n")
        return 2

    if len(matches) > 1:
        sys.stderr.write(
            f"Error: ambiguous target '{target}' matched {len(matches)} candidates in {rel_path}:\n"
        )
        for idx, m in enumerate(matches, 1):
            span = f"L{m.start_line}-L{m.end_line}".ljust(10)
            sys.stderr.write(f"  {idx}) {span} {m.kind} {m.qualified_name}\n")
        sys.stderr.write(
            "\nTip: Disambiguate with Class.method (e.g. BaseModel.model_dump) or read line range directly.\n"
        )
        return 3

    chosen = matches[0]
    src_lines = content.splitlines()
    block_lines = src_lines[chosen.start_line - 1 : chosen.end_line]

    # Check for syntax errors within block range
    block_errors = [
        e for e in parsed.syntax_errors if chosen.start_line <= e.line <= chosen.end_line
    ]

    error_tag = ""
    if block_errors:
        n = len(block_errors)
        error_tag = " [! 1 syntax error]" if n == 1 else f" [! {n} syntax errors]"

    if raw:
        print("\n".join(block_lines))
    else:
        print(f"=== {rel_path} (L{chosen.start_line}-L{chosen.end_line}){error_tag} ===")
        for err in block_errors:
            print(f"  Syntax Notice: L{err.line}: {err.message}")
        for idx, line in enumerate(block_lines):
            line_num = chosen.start_line + idx
            line_padded = str(line_num).rjust(5)
            print(f"{line_padded} | {line}")

    return 0
