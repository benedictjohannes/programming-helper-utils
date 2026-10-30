"""Type definitions and models for skim-py."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class SyntaxNotice:
    line: int
    message: str


@dataclass
class OutlineItem:
    name: str
    kind: str  # 'function', 'async def', 'class', 'method', 'test', 'var', 'type'
    start_line: int
    end_line: int
    raw_header: str
    parent_name: Optional[str] = None
    fields_or_variants: List[str] = field(default_factory=list)
    children: List[OutlineItem] = field(default_factory=list)

    @property
    def qualified_name(self) -> str:
        if self.parent_name:
            return f"{self.parent_name}.{self.name}"
        return self.name


@dataclass
class ParsedFile:
    file_path: str
    total_lines: int
    items: List[OutlineItem] = field(default_factory=list)
    imports: List[str] = field(default_factory=list)
    syntax_errors: List[SyntaxNotice] = field(default_factory=list)
    is_test_file: bool = False
    test_ranges: List[tuple[int, int]] = field(default_factory=list)
