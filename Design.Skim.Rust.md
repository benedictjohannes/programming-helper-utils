# Specification & Architecture: Rust Skim Utility (`skim-rs`)

## 1. Overview & Role in the `skim-*` Family

`skim-rs` is the Rust implementation in the universal [`skim-*` utility family](Design.Skim.md). It delivers fast, language-aware syntactic outlines (`glance`) and verbatim code block extractions (`block`) for `.rs` files, tailored for AI coding agents and LLM pair-programming workflows.

Universal CLI subcommands, flags, output layout and exit codes are defined in [Design.Skim.md](Design.Skim.md). This document details the Rust-specific parsing engine, item model, impl/module resolution, test detection, and the places where the current implementation deviates from the family standard (see §8).

---

## 2. Architecture & Engine

`skim-rs` is a single binary crate (Rust 2024 edition, crate version `0.0.x`) built on the Rust Analyzer syntax stack:

1. **Parsing**: `ra_ap_syntax::SourceFile::parse(content, Edition2024)` produces a lossless, error-resilient CST plus a list of syntax errors. No type checking, name resolution, or `mod foo;` file following is performed — each file is parsed in isolation.
2. **Item Collection** (`parser.rs`): The typed AST is walked once, recursing into inline `mod x { ... }` bodies, and flattened into a `Vec<Item>` (see §3).
3. **Rendering**: `glance.rs` and `block.rs` consume the flat item list; `fs.rs` handles path discovery, test-path exclusion, and byte-offset → line mapping.

### Why `ra_ap_syntax`?
- **Error resilience**: Agents routinely run `skim-*` mid-edit. The parser recovers around broken code, so valid items before and after an error are still outlined and extractable (per [Design.Skim.md §3.3](Design.Skim.md)).
- **Fidelity**: Tracks the real Rust grammar (including `async`/`unsafe`/`const` fn qualifiers, `where` clauses, `macro` 2.0, unions).
- **Pure Rust**: No C FFI, no `syn`/proc-macro machinery, small dependency tree, fast startup.

The `ra_ap_*` crates are pinned to a single version (currently `0.0.360`); they carry no semver stability guarantees, so upgrades are deliberate.

### Dependencies
| Crate | Role |
|:---|:---|
| `ra_ap_syntax` | CST/AST parser |
| `ra_ap_edition` | `Edition2024` selector for the parser |
| `text-size` | `TextRange` for signature slicing |
| `walkdir` | Recursive directory traversal |
| `glob` | Expands glob inputs for shells that do not |

Argument parsing is hand-rolled (no `clap`) to keep binary size and compile time minimal. `SIGPIPE` is reset to default on Unix via a direct `signal(2)` call so that `skim-rs … | head` terminates quietly instead of panicking.

---

## 3. Item Model & Extraction

### 3.1 Extracted Symbols & Scope

Each extracted symbol is an `Item { kind, name, qualified_name, signature, start_line, end_line, is_test, details, depth, impl_ctx }`.

| Source construct | `kind` (printed) | Notes |
|:---|:---|:---|
| `fn` | `fn` | Free functions |
| `fn` in `impl` with a `self` parameter | `method` | Inherent *and* trait impls; `qualified_name = Type::name` |
| `fn` in `impl` without `self` | `fn` | Associated functions such as `Type::new`; also `qualified_name = Type::name` |
| `struct` | `struct` | `details`: fields |
| `enum` | `enum` | `details`: variants |
| `trait` | `trait` | `details`: associated fns, types, consts, macro calls |
| `type` | `type` | Free aliases and impl-associated types |
| `const` | `const` | Free constants and impl-associated consts |
| `static` | `static` | |
| `mod` | `mod` | Inline and out-of-line (`mod foo;`) declarations |
| `macro_rules!` / `macro` | `macro` | Signature is synthesized: `macro_rules! name` / `macro name` |
| `union` | `union` | |

Not extracted: `use` (reported separately via `-u`), `extern crate`, `extern { }` blocks, `trait` aliases, free-standing macro invocations, and anything inside function bodies (per the family's no-nested-locals rule).

`impl` blocks are not block targets. Their members are hoisted into the item list as siblings, qualified by the self type, and each carries an `impl_ctx` (header text + span) so `glance` can group them (§4.3) and ambiguity errors can name the originating impl. The self type name is the last path segment of the type, with references stripped and generics dropped (`impl<T> Trait for &Vec<T>` → `Vec`). Non-path self types (tuples, slices, arrays, `dyn`) fall back to their raw source text.

### 3.2 Inline Module Handling

Out-of-line modules (`mod foo;`) are listed but deliberately **never followed**: every `skim-*` tool operates on one file at a time (one header, one set of line spans), and following would duplicate output in directory globs and require reimplementing module resolution (`#[path]`, `cfg`). `glance` the directory to see their contents.


- Items inside an inline module receive a `mod::` prefix on `qualified_name` (nested: `a::b::Type::method`) and `depth = nesting level`.
- `glance` outlines inline modules recursively: the `mod` line is followed by its items, indented one level per nesting depth (`impl` members one further level). Test modules remain hidden by default, and so does everything inside them.
- `block` resolves items at **any depth** (see §4.2).
- `use` declarations are collected only at file level.

### 3.3 Signatures (`-s`) and Details (`-d`)

- **Signatures**: Rendered by concatenating the CST tokens of the node up to (excluding) its body (`{ … }` block, field list, variant list, or item list), skipping attributes and comments, then whitespace-collapsed. Comments (doc, line, block, including those inside parameter lists) and attributes are never emitted (per [Design.Skim.md §3.1.1](Design.Skim.md)); the same token filter produces `-d` members, so `///` docs and field attributes never appear there. Visibility, qualifiers (`async`, `unsafe`, `const`, `extern`), generics, parameters, return type and `where` clauses are therefore preserved verbatim. `type`, `const`, `static` render their full source text minus the trailing `;` (including initializer). With `-s`, the `<kind>` column is dropped, since the signature already begins with the keyword. `glance` prints each `impl` header (`impl<T> Trait for Foo<T>`, no body) once, with its span, followed by its visible members indented two extra spaces.
- **Details (`-d`)**: Printed beneath the parent as `      | <member>`.
  - Structs: `pub name: Type` (tuple structs: `pub Type`).
  - Enums: full variant text including payloads and discriminants (`Found(T)`, `Err { code: u16 }`, `A = 1`).
  - Traits: method signatures (no bodies), associated types, consts.
  - Other kinds have no details.

### 3.4 Filtering (`-f`)
Consistent with the rest of the family, `-f` matches against the item's name, signature, details **and full source text including its body**, case-insensitively; every `-f` term must match (AND). Because items inside inline modules are outlined, a match inside `mod foo { fn bar() {…} }` is reported as `mod foo` followed by the matching `bar` (a module is kept when its text matches, and its members are filtered individually).

### 3.5 Line Spans

Spans come from the node's text range, so **outer attributes and doc comments are included** in the span (this is the family rule, [Design.Skim.md §3.1.1](Design.Skim.md)) (`#[derive(...)]` is line 1 of a struct's block). Lines are 1-indexed and inclusive.

---

## 4. Target Resolution (`block`)

### 4.1 Target Syntax
- **Canonical**: `Type::method` (e.g. `Router::route`, `Settings::explain`), also for associated consts and types.
- **Standalone**: any item name — `Router`, `into_response`, `MAX_RETRIES`, `my_macro`.
- **Rust qualified path** (impl members): `<Type as Trait>::method` for trait impls, `<Type>::method` for inherent impls. Quote it in the shell (`'<User as Greeter>::dup'`).
- **Module-qualified**: `inner::Type::method`, or any trailing suffix of that path.

### 4.2 Resolution Precedence

Candidates are all non-test items (or all items under `-t`) at **any** nesting depth. The first non-empty tier wins:

*Qualified target (contains `::`):*
1. Exact match on `qualified_name`.
2. Case-insensitive match on `qualified_name`.
3. Case-insensitive **path-suffix** match (`Type::method` finds `inner::Type::method`).

*Standalone target:*
1. Exact match on `name`.
2. Exact match on `qualified_name`.
3. Case-insensitive match on `name`.
4. Case-insensitive match on `qualified_name`.

*Both:* 5. Case-insensitive substring match on `name` or `qualified_name`.

*Rust qualified path (`<Type as Trait>::method`, `<Type>::method`):* matched against impl members only. `Type` matches the full self-type text (`Wrapper<u8>`) or its base name (`Wrapper`); `Trait` matches the full trait text (`From<u16>`, `std::fmt::Display`) or, when the query has no generics, the trait's base name (`Display`). Matching is case-insensitive and ignores whitespace, with exact-case method names preferred. `<Type>::method` selects inherent impls only.

`Type::method` stays ambiguous when several impls define the same name (inherent vs trait, `Display` vs `Debug` `fmt`, `From<A>` vs `From<B>`). The ambiguity error (exit `3`) then lists every candidate as its exact qualified path, ready to copy (`<Wrapper<u8> as From<u16>>::from`).

### 4.3 Output
- Gutter: `{line:5} | {text}` (5-wide right-aligned); `--raw` prints source lines only.
- Header includes the syntax-error tag and notices when errors fall within the block's span.
- Ambiguity error: `Error: ambiguous target '…' matched N candidates in <file>:`, impl members are listed as their qualified path (`<S as Default>::default`), and members of inline modules gain `(in mod a::b)`; exit `3`. The tip for impl candidates reads `Tip: Quote a Rust qualified path to disambiguate impls (e.g. '<Router as Service>::call', or '<Router>::route' for inherent), or read line range directly.`; other ambiguities keep the `Type::method` tip.

---

## 5. Test Handling (Filtered Out by Default)

Excluded unless `-t` / `--include-tests`:

- **Paths**: any directory component named `tests` (pruned during traversal; explicit paths are matched on `/tests/` or leading `tests/`, with `\` normalized), and files named `*_test.rs`. Under `-t` such files get a ` [test]` header tag.
- **Items** (`is_test = true`) when any of:
  - an outer attribute contains the **identifier** `test`, `rstest` or `test_case` (covers `#[test]`, `#[tokio::test]`, `#[cfg(test)]`, `#[cfg(all(test, …))]`). Only identifier tokens are inspected, so `feature = "testing"` and doc strings never match, and any attribute containing `not` (`#[cfg(not(test))]`) is treated as regular code;
  - a `mod` is named `tests` or `test`;
  - the item is inside a test module, or inside an `impl` carrying a test attribute (inherited).
- Function names are deliberately **not** used (`fn test_connection()` is regular code).

---

## 6. Syntax Diagnostics

Per [Design.Skim.md §3.3](Design.Skim.md): the parser's error list is mapped to 1-indexed lines.
- `glance`: header gets ` [! N syntax error(s)]`; one `  Syntax Notice: L<n>: <message>` line per error follows the header; recovered items are still outlined. A file with syntax errors is never skipped by `-f` filtering.
- `block`: errors whose line lies within the target's span are attached to the block header the same way.
- Exit code remains `0` when the command otherwise succeeds.

---

## 7. File & Module Structure, Packaging, Verification

```text
skim-rs/
├── Cargo.toml
├── src/
│   ├── main.rs     # Argument parsing, usage text, SIGPIPE reset, exit codes
│   ├── glance.rs   # Outline rendering, filter matching, header/notice output
│   ├── block.rs    # Target resolution tiers, gutter/raw output, ambiguity reporting
│   ├── parser.rs   # ra_ap_syntax walker, item processors, signature formatter, test detection
│   ├── model.rs    # Item, ItemKind, DetailMember, SyntaxNotice, ParsedRustFile
│   └── fs.rs       # LineIndex, path collection, test-path exclusion
├── fixtures/       # broken.rs, casing.rs, comments.rs, impls.rs, nested_mods.rs, tests.rs, false_tests.rs
└── tests/integration_tests.rs   # Runs the built binary against fixtures
```

**Distribution**: `cargo install --path skim-rs` (local) or `cargo install skim-rs`. Release profile: `opt-level = 3`, thin LTO, one codegen unit, stripped.

**Automated tests** (`cargo test`) cover: signatures/imports, doc-comment stripping from signatures, exact-case precedence, inherent vs trait impl resolution, Rust qualified-path targets, test filtering, syntax-error indication in `block`, recursive inline-module outlines, resolution inside inline and test modules, filter-within-block matching, and missing-path warnings, and comment stripping in `-s`/`-d` (fixtures/comments.rs).

**Smoke testing**: build the release binary and run against a large real repository (e.g. `tokio-rs/axum` cloned under `testingRepositories/rust/`):
```bash
skim-rs glance axum/src/lib.rs -s -u
skim-rs glance axum/src/ -s -f "Router"
skim-rs block axum/src/routing/mod.rs Router::route
skim-rs block axum/src/routing/mod.rs router::route      # case-insensitive
skim-rs block axum/src/handler/mod.rs Handler --raw
skim-rs glance axum/src/ -s -f test                       # compare with -t
```

---

## 8. Known Issues

- **Edition is hardcoded to 2024**; files in older editions may differ at the margins (e.g. `async`/`gen` keywords).
- **Test coverage gaps**: `-d` on traits, unions and tuple structs; multi-line `use` trees with `-u`; macro items.
