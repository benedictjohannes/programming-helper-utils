# Specification & Architecture: Python Skim Utility (`skim-python` / CLI `skim-py`)

## 1. Overview & Role in the `skim-*` Family

`skim-py` is the Python implementation in the universal [`skim-*` utility family](Design.Skim.md). It delivers language-aware, fast syntactic outlines (`glance`) and verbatim code block extractions (`block`) tailored for AI coding agents and LLM pair-programming workflows.

While the universal CLI flags, formatting rules, and exit codes conform strictly to [Design.Skim.md](Design.Skim.md), this document details the Python-specific architecture, the hybrid parsing engine, CST error recovery, and language-specific nuances.

---

## 2. Architecture: Hybrid Parser Pipeline (`ast` + `parso`)

Exploring codebases during active editing frequently encounters in-flight syntax errors (unclosed brackets, broken headers, unfinished statements). Rather than failing or relying on fragile regex line-masking heuristics, `skim-py` employs a **two-tier hybrid parsing architecture**:

1. **Primary Pass (`ast.parse`)**: Fast CPython AST visitor. Provides sub-millisecond sweeps with zero third-party overhead on valid code.
2. **Fallback Pass (`parso` CST)**: Triggered only on `SyntaxError`. Lazily imports `parso` (0ms penalty on clean code) to recover surviving functions, classes, and methods around broken syntax with paired diagnostics.
3. **Normalized Output (`OutlineItem[]`)**: Produces uniform symbol records dispatched to either `glance` (syntactic tree/signature outlines & notices) or `block` (verbatim code block extraction).

### Why a Hybrid Pipeline?

1. **Fast-Path Performance**: Standard library `ast.parse` is implemented in C and parses files in sub-millisecond time (~0.5–1ms per file). Running repository-wide recursive directory sweeps (`glance <dir>`) on valid source trees incurs zero third-party parser overhead.
2. **Zero Import Latency on Clean Code**: `parso` takes ~25–30ms to import, while `ast` takes < 1ms. By lazily importing `parso` strictly inside `except SyntaxError:`, CLI invocations across valid code retain instant startup.
3. **Robust Error Recovery**: When syntax errors occur, `parso` provides a resilient concrete syntax tree (CST) that recovers surviving functions, classes, and methods around the broken code without crashing or altering line numbers.

---

## 3. CST & AST Extraction Engine

The parser module (`skim_py.parser`) converts Python source files into a normalized `ParsedFile` containing a list of `OutlineItem` records.

### 3.1 Extracted Symbols & Scope
Per the [Design.Skim.md](Design.Skim.md) specification, `skim-py` outlines top-level module declarations and direct class members. Nested helper functions and local classes defined inside function/method bodies are intentionally omitted to avoid context bloat:

- **Functions & Async Functions**: `def name(...) -> Ret:`, `async def name(...) -> Ret:`
- **Classes**: `class Name[T](Base1, Base2):`
- **Methods**: Instance, `@classmethod`, `@staticmethod`, and `@property` methods within classes.
- **PEP 695 Type Aliases**: `type Alias[T] = dict[str, T]`
- **Module Constants & Variables**: Annotated variables (`NAME: int = 1`), uppercase constants (`CONFIG = ...`), and dunder attributes (`__all__ = ...`).
- **Class Attributes & Fields**: Annotated model/dataclass fields (`name: str = "default"`) and class attributes.

### 3.2 Decorator Handling
Decorators are integral to a symbol's definition and are preserved as part of the block span (from the first decorator through the symbol's end):
- **Stacked & Multi-line Decorators**: Spans encompass all preceding decorators (e.g. `@app.route(...)`, `@typing_extensions.deprecated(...)`).
- **Token Formatting (`_parso_code_one_line`)**: In the CST fallback pass, multi-line decorators and signatures are reconstructed leaf-by-leaf. Whitespace within string literals (e.g. `@route("/path with spaces")`) is preserved, while interior comments and multi-line indentations are cleaned into a single-line declaration.

### 3.3 Line Boundary & Body Normalization
- **End Line Correction (`get_parso_end_line`)**: `parso`'s `end_pos` is a `(line, col)` tuple that frequently lands on `(N+1, 0)` due to trailing newlines. The parser normalizes end lines to the line of the last significant token.
- **Compound Body Recovery (`_parso_recovery_end`)**: When a function or method header has a syntax error, subsequent indented lines—including compound statements (`if`, `for`, `try/except`) and same-indent sibling methods—are scanned and bounded to ensure `block` extracts the complete body without truncating.

### 3.4 In-Flight Syntax Error Localization
When syntax errors are present:
1. **Primary Notice**: CPython's `first_err` message and line number are captured (e.g. `Syntax Notice: L136: '(' was never closed`), providing high-quality CPython diagnostics.
2. **CST Localization**: Secondary error locations are gathered from Parso's `iter_errors` and `error_node` elements.
3. **Cascade Suppression**: Errors that occur inside already-salvaged broken declarations are suppressed to avoid duplicate or cascading diagnostics.
4. **PEP 695 Soft-Keyword Handling**: Parso's temporary `error_node` diagnostics for `type Alias = ...` statements are tracked via `type_alias_spans` and suppressed once the alias is successfully reconstructed.

---

## 4. Key Python Language Nuances

### 4.1 Target Syntax & Resolution (`Class.method`)
`block` retrieves code blocks using Python-idiomatic target identifiers:
- **Canonical Target**: `Class.method` (e.g. `BaseModel.model_dump`, `FieldInfo.from_annotation`).
- **Standalone Identifiers**: Functions, classes, module-level variables, or type aliases (e.g. `BaseModel`, `create_model`, `DEFAULT_CONFIG`).
- **Dunders & Properties**: Direct support for dunder methods (`BaseModel.__init__`) and property accessors (`Model.model_extra`).
- **Resolution Precedence**:
  1. *Exact Case Match*: If both `Item` (class) and `item` (function) exist, the exact-case match wins.
  2. *Case-Insensitive Match*: `basemodel.model_dump` matches `BaseModel.model_dump`.
  3. *Substring Match*: Falls back to substring matching if no exact or case-insensitive identifier matches.

### 4.2 Test Filtering by Default
Tests are excluded by default to avoid inflating LLM context windows with assertions and mocks:
- **File Exclusions**: Files matching `test_*.py`, `*_test.py`, `conftest.py`, and directories named `tests/`, `test/`, `testing/`, `__tests__/` are skipped.
- **In-File Exclusions**: Classes matching `^Test[A-Z0-9_]` or inheriting from `TestCase` (checked strictly within class base definitions), and functions matching `^test_` or `^test[A-Z0-9_]`, are omitted.
- **Opt-In (`-t` / `--include-tests`)**: When passed, test files and test blocks are included and annotated with `[test]`.

### 4.3 Declarations (`-s`) and Details (`-d`)
- **Signatures (`-s`)**: Renders function signatures with parameters and return types without bodies, class headers with generic parameters and bases, and type aliases.
- **Details (`-d`)**: Renders class fields, annotated dataclass/Pydantic attributes, and enum variants indented under the type with `| <field>`.

---

## 5. File & Module Structure

Directory: `python/skim-py/`
- `pyproject.toml`: PEP 621 metadata and dependencies (`parso >= 0.8.7`).

**Files in `src/skim_py/`**:
- `__init__.py`: Package version and export definitions.
- `cli.py`: CLI entry point, argument parsing (`glance`, `block`), and standard exit codes.
- `glance.py`: `glance` subcommand: recursive traversal, filtering, and tree outline output.
- `block.py`: `block` subcommand: target resolution, line-gutter formatting, and `--raw` mode.
- `parser.py`: Hybrid parser (`ast` fast-path + lazy `parso` CST fallback).
- `types.py`: Data models (`OutlineItem`, `ParsedFile`, `SyntaxNotice`).

**Test files in `tests/`**:
- `test_skim_py.py`: Comprehensive test suite (41 tests) covering CLI, outlines, targets, and syntax recovery.
- `fixtures/`: Dedicated fixtures covering casing collisions, decorators, dataclasses/enums (`-d`), test filtering, and syntax mutations (unclosed brackets, broken headers, PEP 695 aliases).

---

## 6. Packaging, Distribution & CLI Standard

- **PyPI Package Name**: `skim-python`
- **CLI Executable Name**: `skim-py`
- **Minimum Python Version**: `Python >= 3.10`
- **Runtime Dependencies**: `parso >= 0.8.7` (pure-Python wheel, zero native compilation required).
- **Packaging Standard**: PEP 621 `pyproject.toml` using `hatchling`:
  ```toml
  [project.scripts]
  skim-py = "skim_py.cli:main"
  ```
- **Execution Modes**:
  - Ephemeral via `uvx`:
    ```bash
    uvx --from skim-python skim-py glance src/ -s
    ```
  - Global install via `uv tool`:
    ```bash
    uv tool install skim-python
    ```
  - Ephemeral / Global via `pipx`:
    ```bash
    pipx run --spec skim-python skim-py block src/models.py User.get_id
    ```
- **Exit Codes**: Conforms to [Design.Skim.md Section 4](Design.Skim.md#4-exit-codes-standard) (`0` = Success, `1` = Error, `2` = Target Not Found, `3` = Ambiguous Target).

---

## 7. Verification & Testing Strategy

### 7.1 Automated In-Tree Test Suite
Automated regression tests run via standard Python `unittest`:
```bash
python3 -m unittest discover -s tests
```
The suite verifies:
- Outline structure, signature extraction, and details flags.
- Case precedence and qualified symbol resolution.
- Test filtering by default and `-t` inclusion.
- Error resilience across all fixture files (recovering valid symbols before and after errors).
- Decorator leak prevention and multiline decorator formatting.
- PEP 695 type alias extraction under syntax recovery.

### 7.2 Real-World Smoke Testing
Verified against `testingRepositories/pydantic` (`pydantic/main.py`, ~1,950 lines):
- **Outline & Imports**: `skim-py glance testingRepositories/pydantic/pydantic/main.py -s -u`
- **Filtered Exploration**: `skim-py glance testingRepositories/pydantic/pydantic/ -s -f "BaseModel"`
- **Block Extraction**: `skim-py block testingRepositories/pydantic/pydantic/main.py BaseModel.model_dump`
- **Raw Block Extraction**: `skim-py block testingRepositories/pydantic/pydantic/main.py BaseModel.model_dump --raw`
- **Test Exclusion Check**: `skim-py glance testingRepositories/pydantic/tests/ -s` (skips test suite by default).

### 7.3 In-Flight Syntax Mutation Smoke Tests
Deliberate mutations verified against `pydantic/main.py`:
1. **Mutation A (Broken Method Header)**: Injected `def model_dump(self, *mode = `.
   - *Result*: Captures CPython syntax notice `var-positional argument cannot have default value`, outlines surviving methods, extracts `BaseModel.model_copy` via `block` cleanly.
2. **Mutation B (Unclosed Multi-line Bracket in Class Body)**: Removed closing brace in dictionary comprehension inside `model_copy`.
   - *Result*: Captures syntax notice `closing parenthesis ')' does not match opening parenthesis '{'`, recovers surrounding methods, extracts `BaseModel.model_construct` via `block` cleanly.
3. **Mutation C (Broken Class Header)**: Injected `class BaseModel(`.
   - *Result*: Captures syntax notice `'(' was never closed`, marks class header `class BaseModel [syntax error]`, attaches subsequent indented methods to `BaseModel`, and extracts `BaseModel.model_construct` via `block`.
