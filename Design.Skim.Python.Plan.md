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
skim-py glance testingRepositories/pydantic/pydantic/main.py -s -u
skim-py glance testingRepositories/pydantic/pydantic/ -s -f "BaseModel"

# Block extraction:
skim-py block testingRepositories/pydantic/pydantic/main.py BaseModel.model_dump
skim-py block testingRepositories/pydantic/pydantic/main.py BaseModel.__init__
skim-py block testingRepositories/pydantic/pydantic/main.py BaseModel -d
skim-py block testingRepositories/pydantic/pydantic/main.py BaseModel.model_dump --raw

# Test exclusion check:
skim-py glance testingRepositories/pydantic/tests/ -s  # (omitted by default unless -t is passed)
skim-py glance testingRepositories/pydantic/tests/ -s -t
```

### Step 1b: In-Flight Syntax Mutation Smoke Test (Interactive Verification)
Target file: `testingRepositories/pydantic/pydantic/main.py` (defines `class BaseModel`, ~1,900 lines).

1. **Baseline check (Fast Path - `ast.parse`)**:
   ```bash
   skim-py glance testingRepositories/pydantic/pydantic/main.py -s -f "model_dump"
   ```
2. **Inject deliberate in-flight syntax errors**:
   - Mutation A (broken method header): `def model_dump(self, *mode = ` (unclosed paren/param)
   - Mutation B (unclosed multi-line bracket inside `BaseModel` body)
   - Mutation C (broken class header): `class BaseModel(` (unclosed base)
3. **Verify Error Recovery (Fallback Path - `parso`)**:
   ```bash
   # Outlines surviving methods and BaseModel, emitting the syntax notice at the top:
   skim-py glance testingRepositories/pydantic/pydantic/main.py -s -f "BaseModel"

   # Extracts surviving methods without crashing:
   skim-py block testingRepositories/pydantic/pydantic/main.py BaseModel.model_validate
   ```
4. **Restore clean state**:
   ```bash
   git -C testingRepositories/pydantic checkout pydantic/main.py
   ```

### Step 2: In-Tree Fixtures & Automated Unit Tests
Create a `tests/fixtures/` directory inside `python/skim-py/`:
- `fixtures/classes.py`: Methods, staticmethods, classmethods, properties, async defs.
- `fixtures/casing.py`: Exact-case vs lowercase conflict resolution.
- `fixtures/tests.py`: Mixed `unittest.TestCase` / `def test_*` functions with regular functions.
- `fixtures/advanced_typing.py`: Generics, PEP 695 `type`, dataclasses, and Enums with `-d`.
- Automate assertions via standard `python3 -m unittest`.

## 6. Architecture Evolution: Hybrid Parser (`ast` + `parso`)

### Motivation
The other utilities in the `skim-*` family use tolerant AST/CST parsers (`ra_ap_syntax` for Rust, `typescript` compiler API for TS, `go/parser` for Go). 
In Python, the initial implementation used standard library `ast.parse()` combined with a heuristic fallback for syntax errors (regex header salvage, indentation guessing, upward decorator scanning, and iterative string masking). 

While this had zero runtime dependencies, heuristic string masking does not scale to multi-line brackets or nested syntax errors. Since `skim-python` is distributed via standard package managers (`uv`, `pipx`, `pip`), adding `parso` as a runtime dependency avoids fragile heuristics while keeping installation simple (pure Python wheel).

### Architecture: Hybrid Pipeline

1. **Primary Pass (Fast Path — CPython `ast`)**:
   - Parse using standard library `ast.parse(content, filename=file_path, type_comments=True)`.
   - CPython's C-implemented parser is significantly faster than pure-Python CST parsers, keeping recursive repository walks (`glance <dir>`) fast on valid files.
   - `parso` is imported lazily inside `except SyntaxError:`. Because `parso` takes ~25–30ms to import versus ~1ms for `ast`, lazy loading avoids adding import latency to normal CLI runs on valid code.

2. **Fallback Pass (Error Recovery — `parso`)**:
   - When `ast.parse` raises `SyntaxError`, capture CPython's specific error message and line number for the primary syntax notice (e.g. `'(' was never closed`).
   - Parse the unmutated content using `parso.parse(content)`.
   - Traverse the resulting CST to extract surviving top-level and class-level functions and classes.
   - Use `parso`'s error node/leaf locations to record additional syntax notices without regex or line masking.

3. **CST Mapping Details**:
   - **Decorators**: In `parso`, decorators wrap the function or class in a `decorated` node rather than attaching directly to the `Function` or `Class` node.
   - **Line Boundaries**: `parso`'s `end_pos` is a `(line, col)` tuple that includes trailing newlines (frequently landing on `(N+1, 0)`). Normalize end lines by checking trailing tokens.
   - **Grammar Version**: Pass the target Python grammar version explicitly to avoid defaulting to an older runtime environment when run under older interpreters.

### Migration Tasks
1. **Dependencies (`pyproject.toml`)** [COMPLETED]:
   - Added `parso >= 0.8.4` to `dependencies` in `python/skim-py/pyproject.toml`.
2. **Refactor `python/skim-py/src/skim_py/parser.py`** [COMPLETED]:
   - Retained the `ast.AST` extraction visitor for valid files (fast path).
   - Removed line-masking loops, `get_block_end`, bracket-balancing, and `__skim_masked__` stubs.
   - Implemented `_parse_fallback_parso(file_path, content, ...)` with lazy `import parso`.
   - Normalized `decorated` node spans, multi-line decorator formatting, and `(line, col)` boundaries to `OutlineItem`.
   - Preserved syntax error messages from CPython combined with parso CST error localization.
3. **Tests & Fixtures** [COMPLETED]:
   - Verified existing fixtures (`syntax_error.py`, `syntax_error_cascade.py`).
   - Added fixtures for multi-line unclosed brackets (`unclosed_bracket.py`) and PEP 695 syntax under syntax errors (`pep695_syntax_error.py`).
   - Verified smoke tests and in-flight syntax mutations against `testingRepositories/pydantic/pydantic/main.py` (Mutations A, B, and C).
   - All 34 automated unit tests pass.
