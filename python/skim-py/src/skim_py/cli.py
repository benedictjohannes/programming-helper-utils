"""CLI entrypoint for skim-py."""

from __future__ import annotations
import sys
import argparse
from typing import List, Optional

from .glance import run_glance
from .block import run_block


USAGE_DOC = """\
skim-py: Fast Python outline & block extractor without test bloat.
Prefer this over reading entire .py files to preserve token context.

Usage:
  skim-py glance [options] <path>...
  skim-py block  [options] <file> <target>

glance:
  Outline structure, signatures, and line ranges across files/directories.

  Usage:
    skim-py glance [options] <path>...

  Arguments:
    <path>...                 One or more source files, directories, or globs

  Options:
    -s, --signatures          Show declarations & types without function bodies
    -d, --details             Show class attributes, annotated fields, and enum members
    -u, --uses, --imports     Display top-level import statements
    -f, --filter <text>       Filter items containing <text> (case-insensitive, repeatable)
    -t, --include-tests       Include test files (test_*.py, etc.) and test blocks

  Examples:
    skim-py glance src/models.py
    skim-py glance src/ -s -u
    skim-py glance src/ -s -f "BaseModel"

block:
  Extract verbatim code block for a class, method, function, or variable.

  Usage:
    skim-py block [options] <file> <target>

  Arguments:
    <file>                    Path to the source file
    <target>                  Name of class, method, function, or Class.method

  Options:
    -t, --include-tests       Search inside test files and test blocks
    --raw                     Omit line number gutter

  Examples:
    skim-py block src/models.py BaseModel
    skim-py block src/models.py BaseModel.model_dump
    skim-py block src/models.py BaseModel.model_dump --raw

  Disambiguation:
    If multiple items match, qualify Class.method (e.g. BaseModel.model_dump) or read line range directly.

Agent Operational Workflow:
  1. Glance first:   skim-py glance <path> -s
  2. Locate logic:   skim-py glance <path> -f <keyword>
  3. Inspect code:   Use `block <file> <Class.method>`, or read reported line spans (Lxx-Lyy)
"""


def main(args: Optional[List[str]] = None) -> int:
    if sys.version_info < (3, 10):
        current_ver = f"{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}"
        sys.stderr.write(f"Error: skim-py requires Python 3.10+ (running on Python {current_ver}).\n")
        return 1

    if args is None:
        args = sys.argv[1:]

    if not args or args[0] in {"-h", "--help"}:
        sys.stdout.write(USAGE_DOC)
        return 0

    subcommand = args[0]

    if subcommand == "glance":
        parser = argparse.ArgumentParser(
            prog="skim-py glance",
            description="Outline structure, signatures, and line spans.",
            add_help=False,
        )
        parser.add_argument("-s", "--signatures", action="store_true")
        parser.add_argument("-d", "--details", action="store_true")
        parser.add_argument("-u", "--uses", "--imports", action="store_true", dest="uses")
        parser.add_argument("-f", "--filter", action="append", default=[], dest="filter")
        parser.add_argument("-t", "--include-tests", action="store_true", dest="include_tests")
        parser.add_argument("-h", "--help", action="store_true")
        parser.add_argument("targets", nargs="*")

        parsed_args, extra = parser.parse_known_args(args[1:])
        if parsed_args.help:
            sys.stdout.write(USAGE_DOC)
            return 0
        if not parsed_args.targets:
            sys.stderr.write("Error: missing target path(s) for glance.\n")
            return 1

        return run_glance(
            targets=parsed_args.targets,
            signatures=parsed_args.signatures,
            details=parsed_args.details,
            uses=parsed_args.uses,
            filters=parsed_args.filter,
            include_tests=parsed_args.include_tests,
        )

    elif subcommand == "block":
        parser = argparse.ArgumentParser(
            prog="skim-py block",
            description="Extract verbatim code block.",
            add_help=False,
        )
        parser.add_argument("-t", "--include-tests", action="store_true", dest="include_tests")
        parser.add_argument("--raw", action="store_true")
        parser.add_argument("-h", "--help", action="store_true")
        parser.add_argument("positionals", nargs="*")

        parsed_args, extra = parser.parse_known_args(args[1:])
        if parsed_args.help:
            sys.stdout.write(USAGE_DOC)
            return 0
        if len(parsed_args.positionals) < 2:
            sys.stderr.write("Error: block requires <file> and <target> arguments.\n")
            return 1

        file_path = parsed_args.positionals[0]
        target = parsed_args.positionals[1]

        return run_block(
            file_path=file_path,
            target=target,
            raw=parsed_args.raw,
            include_tests=parsed_args.include_tests,
        )

    else:
        sys.stderr.write(f"Error: unknown subcommand '{subcommand}'. Use 'glance' or 'block'.\n\n")
        sys.stdout.write(USAGE_DOC)
        return 1


if __name__ == "__main__":
    sys.exit(main())
