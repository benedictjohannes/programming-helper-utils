# Plan: `skim-rs`

## 1. Objective
Build a fast, AST-based Rust outline and code block extractor conforming to [Design.md](Design.md).

## 2. Architecture & Technologies
- **Location**: `rust/skim-rs/`
- **Crate Type**: Single binary crate (`skim-rs`)
- **Language**: Rust (Edition 2024)
- **Core Dependencies**:
  - `ra_ap_syntax` (pinned version): Official Rust Analyzer lossless, error-resilient CST/AST parser. Allows `skim-rs` to reliably outline and extract code even when files have syntax errors during in-progress edits or refactoring.
  - `ra_ap_parser` / `text-size`: Token offset and span utilities.
  - Zero C FFI, 100% safe pure Rust.
- **CLI & Dispatch**:
  - Zero-heavy-framework argument parser keeping binary size minimal and compile times near-instant.
  - Two subcommands: `glance` and `block`.

## 3. Key Language Nuances for Rust

### Test Handling (Filtered out by default)
- **Files & Directories**:
  - When glancing directories or glob patterns, automatically exclude `tests/` directories and `*_test.rs` files unless `-t` / `--include-tests` is passed.
- **In-File Test Items**:
  - Test modules: `#[cfg(test)] mod tests { ... }` or `#[cfg(all(test, ...))]`.
  - Test functions: Functions annotated with `#[test]`, `#[tokio::test]`, `#[actix_rt::test]`, etc.
  - Filtered out from both `glance` outlines and `block` searches unless `-t` is passed.

### Target Syntax & Resolution (`Type::method`)
- **Canonical Syntax**: `Type::method` (e.g., `Router::route`, `Settings::explain`).
- **Impl Resolution**:
  - Supports both **inherent impls** (`impl Router { fn route(...) }`) and **trait impls** (`impl Service for Router { fn call(...) }`).
  - Matches methods qualified by the struct/enum name (`Router::route`), or standalone function/method name (`route`).
- **Matching Semantics**:
  - Case-insensitive by default with exact-case precedence (e.g., `router::route` matches `Router::route`; exact case preferred if type and function names share casing).
  - Fallback to case-insensitive substring matching if neither exact nor case-insensitive identifier matches.
- **Standalone Identifiers**:
  - Functions, structs, enums, traits, type aliases, unions, macros, and constants (e.g., `Router`, `into_response`, `StatusCode`).

### Declarations & Signatures (`-s`)
- Functions & Methods: `pub async fn route(&mut self, path: &str, method_router: MethodRouter<S>) -> Self`
- Structs: `pub struct Router<S = ()>`
- Enums: `pub enum StatusCode`
- Traits: `pub trait IntoResponse: Send + Sized`
- Type Aliases: `pub type BoxError = Box<dyn StdError + Send + Sync>`
- Constants & Statics: `pub const MAX_RETRIES: usize = 5`

### Details Flag (`-d`)
- Structs: List fields with visibility and types (e.g., `pub name: String`).
- Enums: List enum variants and tuple/struct payloads (e.g., `Found(T)`, `NotFound`).
- Traits: List associated items and method signatures.

### Output Formatting
- `glance`: `=== <path> (<N> lines) ===` with left-padded line spans `  L<start>-L<end>   <kind> <header>`.
- `block`: `=== <path> (L<start>-L<end>) ===` with 5-digit right-aligned gutter (`%5d | %s`) or `--raw`.
- Ambiguity tip: `Tip: Disambiguate with Type::method (e.g. Router::route) or read line range directly.`

## 4. Verification & Testing Strategy

### Step 1: Smoke Testing (Rapid Real-World Validation)
Build the release binary (`cargo build --release` in `rust/skim-rs/`), then execute from within the target repository (`cwd = testingRepositories/rust`, cloned from `tokio-rs/axum`):
```bash
# In cwd = testingRepositories/rust:
../../rust/skim-rs/target/release/skim-rs glance axum/src/lib.rs -s -u
../../rust/skim-rs/target/release/skim-rs glance axum/src/ -s -f "Router"

# Block extraction:
../../rust/skim-rs/target/release/skim-rs block axum/src/routing/mod.rs Router::route
../../rust/skim-rs/target/release/skim-rs block axum/src/routing/mod.rs router::route
../../rust/skim-rs/target/release/skim-rs block axum/src/handler/mod.rs Handler --raw

# Test exclusion check:
../../rust/skim-rs/target/release/skim-rs glance axum/src/ -s -f "test"
../../rust/skim-rs/target/release/skim-rs glance axum/src/ -s -f "test" -t
```

### Step 2: In-Tree Fixtures & Automated Unit Tests (Hardening)
Create a `fixtures/` directory inside `rust/skim-rs/` containing crafted Rust sources covering edge cases:
- `fixtures/impls.rs`: Inherent vs trait impls, generic parameters, lifetimes, and `where` clauses.
- `fixtures/casing.rs`: Struct `Config` vs function `config` to test exact-case precedence.
- `fixtures/tests.rs`: Mixed `#[cfg(test)]` modules and `#[test]` functions with normal items.
- `fixtures/details.rs`: Complex struct fields and enum variants with `-d`.
- Automate assertions via standard `cargo test`.

## 5. Packaging & Distribution
- Single binary crate in `rust/skim-rs/`.
- Distribution via `cargo install --path rust/skim-rs` (local) or `cargo install skim-rs` (crates.io / git).

## 6. Resilient Parsing & Syntax Diagnostics 

### 6.1 Rationale
AI agents frequently run `skim-*` commands while actively editing or debugging broken files. 
- Traditional tools either hard-crash on the first syntax error (blinding the agent) or silently recover (leaving the agent unaware of corrupted edits).
- `skim-*` takes the third path: **outline as much of the file/block as possible, but flag syntax errors prominently and compactly**.

### 6.2 Implementation in `skim-rs`
- Leverage `ra_ap_syntax`'s error-recovering parser: `SourceFile::parse` produces both a valid recoverable AST and a list of syntax errors via `parse.errors()`.
- Map error text byte offsets to 1-indexed line numbers.
- **`glance` UX**:
  - File header appends an error indicator: `=== <path> (<N> lines) [! <N> syntax errors] ===`.
  - Directly under the header, print compact 1-line diagnostic notices:
    ```text
    === src/config.rs (45 lines) [! 1 syntax error] ===
      Syntax Notice: L18: expected ';'
    ```
  - Continue printing the structural outline of all recovered items.
- **`block` UX**:
  - If the requested target is in or near a syntax error, extract the available block and output a diagnostic note indicating syntax errors exist within the range.
- **Exit Code**: Non-fatal warning (exit code `0` when items are found and outlined, or a dedicated warning exit if nothing could be recovered).
