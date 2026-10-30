# Plan: Python Skim Utility (`skim-python` / CLI `skim-py`)

## 1. Objective
Build a fast, dependency-free Python AST-based outline and verbatim code block extractor conforming to [Design.Skim.md](Design.Skim.md).

## 2. Architecture & Technologies
- **Location**: `python/skim-py/`
- **Language**: Python 3 (Standard Library only, zero 3rd-party dependencies at runtime)
- **Core Standard Library Modules**:
  - `ast`: Parsing Python source files into an AST (`ast.parse(type_comments=True)`). Extracts line and column spans (`lineno`, `end_lineno`, `col_offset`, `end_col_offset`).
  - `tokenize`: For precise decorator spans, docstrings, and signature slicing without modifying formatting.
  - `argparse` / `sys`: Subcommands (`glance`, `block`), CLI options, and conforming exit codes (`0`, `1`, `2`, `3`).
- **Packaging Standard**: Modern PEP 621 (`pyproject.toml`) with standard entrypoint:
  ```toml
  [project.scripts]
  skim-py = "skim_py.cli:main"
  ```

## 3. Key Language Nuances for Python

### Test Handling (Filtered out by default)
- **File filtering**: When scanning directories or globs, automatically exclude test files (`test_*.py`, `*_test.py`, `conftest.py`) and directories (`tests/`, `test/`, `testing/`, `__tests__/`) unless `-t` / `--include-tests` is passed.
- **In-file filtering**: Identify test classes (inheriting from `unittest.TestCase` or matching `^Test[A-Z0-9_]`) and test functions/methods (names matching `^test_` or `^test[A-Z0-9_]`), and filter them out unless `-t` is passed.

### Target Syntax & Resolution (`Class.method`)
- **Canonical Syntax**: `Class.method` (e.g. `BaseModel.model_dump`, `FieldInfo.from_annotation`).
- **Decorators**: When extracting or glancing methods and functions, decorator lines (e.g., `@property`, `@classmethod`, `@staticmethod`, `@field_validator`, `@model_validator`) are tracked as part of the block span (from the first decorator down to block end).
- **Properties & Dunders**: Match property accessors (`Model.field_name`) and dunder methods (`Model.__init__`, `Model.__repr__`).
- **Matching Semantics**:
  - Case-insensitive by default with exact-case precedence (e.g. `basemodel.model_dump` matches `BaseModel.model_dump`; exact case preferred if type and function share casing).
  - Fallback to substring matching if neither exact nor case-insensitive identifier matches.
- **Standalone Identifiers**: functions, classes, top-level constants / module attributes (e.g. `DEFAULT_CONFIG`, `create_model`).

### Declarations & Signatures (`-s`)
- Functions & Methods: `def model_dump(self, *, mode: str = 'python') -> dict[str, Any]:`, `async def fetch(...) -> bytes:`
- Classes: `class BaseModel[T](Sequence, metaclass=ModelMetaclass):`
- PEP 695 Type Aliases & Module-level annotations: `type ModelDict = dict[str, Any]`, `MAX_RETRIES: int = 5`

### Details Flag (`-d`)
- Classes / Dataclasses / Pydantic Models: List class attributes, annotated fields (`field_name: int = 0`), and method names.
- Enums: List enum members and values (`class Status(Enum): ACTIVE = "active"`).

### Output Formatting & Exit Codes
- `glance`: `=== <path> (<N> lines) ===` with left-padded line spans `  L<start>-L<end>   <kind> <header>`.
- `block`: `=== <path> (L<start>-L<end>) ===` with 5-digit right-aligned gutter (`%5d | %s`) or `--raw`.
- Ambiguity tip: `Tip: Disambiguate with Class.method (e.g. BaseModel.model_dump) or read line range directly.`
- Conforming exit codes:
  - `0`: Success
  - `1`: Error (file not found, I/O error, invalid CLI flags)
  - `2`: Not Found (target symbol not found in `block`)
  - `3`: Ambiguous (multiple candidates matched in `block`)

### Syntax Error Handling (In-Flight Edits)
- Capture `SyntaxError` from `ast.parse` and emit syntax notices conforming to [Design.Skim.md](Design.Skim.md) without crashing.

## 4. Packaging, Distribution & PyPI Strategy

- **PyPI Package Name**: `skim-python` (version starting at `0.0.1`)
- **CLI Executable Binary Name**: `skim-py` (retaining the exact universal family naming `skim-go`, `skim-rs`, `skim-ts`, `skim-py`).
- **Usage Modes**:
  - Ephemeral / On-demand:
    ```bash
    uvx --from skim-python skim-py glance src/ -s
    # or
    pipx run --spec skim-python skim-py block ...
    ```
  - Global CLI Install:
    ```bash
    uv tool install skim-python
    # or
    pipx install skim-python
    ```
  - Direct local invocation during development:
    ```bash
    python3 python/skim-py/skim_py/cli.py glance ...
    ```
- **CI/CD Workflow**:
  - GitHub Actions workflow will be added at `.github/workflows/publish-skim-py.yml` to automate testing and publishing to PyPI (via PyPI Trusted Publishing / OIDC or PyPI token).

## 5. Verification & Testing Strategy

### Step 1: Smoke Testing with Advanced Python AST
Target repository: `testingRepositories/pydantic` (clone `pydantic/pydantic`):
```bash
# Outline test:
skim-py glance pydantic/main.py -s -u
skim-py glance pydantic/ -s -f "BaseModel"

# Block extraction:
skim-py block pydantic/main.py BaseModel.model_dump
skim-py block pydantic/main.py BaseModel.__init__
skim-py block pydantic/main.py BaseModel -d
skim-py block pydantic/main.py BaseModel.model_dump --raw

# Test exclusion check:
skim-py glance tests/ -s  # (omitted by default unless -t is passed)
skim-py glance tests/ -s -t
```

### Step 2: In-Tree Fixtures & Automated Unit Tests
Create a `tests/fixtures/` directory inside `python/skim-py/`:
- `fixtures/classes.py`: Methods, staticmethods, classmethods, properties, async defs.
- `fixtures/casing.py`: Exact-case vs lowercase conflict resolution.
- `fixtures/tests.py`: Mixed `unittest.TestCase` / `def test_*` functions with regular functions.
- `fixtures/advanced_typing.py`: Generics, PEP 695 `type`, dataclasses, and Enums with `-d`.
- Automate assertions via standard `python3 -m unittest`.
