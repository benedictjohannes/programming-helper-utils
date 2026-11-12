# Specification & Architecture: TypeScript/JavaScript Skim Utility (`skim-ts`)

## 1. Overview & Role in the `skim-*` Family

`skim-ts` is the TypeScript and JavaScript implementation in the universal [`skim-*` utility family](Design.Skim.md). It delivers fast, language-aware syntactic outlines (`glance`) and verbatim code block extractions (`block`) tailored for AI coding agents and LLM pair-programming workflows.

In addition to standard TypeScript and JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`), `skim-ts` natively supports Single File Components (SFCs):
- **Vue** (`.vue`)
- **Svelte** (`.svelte`)
- **Astro** (`.astro`)

While universal CLI subcommands, options, and exit codes conform strictly to [Design.Skim.md](Design.Skim.md), this document details the TypeScript-specific AST engine, modular SFC preprocessing, whitespace masking architecture, and language-specific target resolution.

---

## 2. Architecture & Engine

`skim-ts` leverages the official TypeScript Compiler API (`typescript` npm package) running on Bun:

1. **Pure TS/JS Path**: Source files are parsed directly via `ts.createSourceFile(...)` using `ts.ScriptTarget.Latest`.
2. **SFC Modular Preprocessing Path (`src/sfc/`)**: Single File Components are preprocessed to isolate script/frontmatter regions from template/markup and style sections.
3. **Unified Single Virtual File AST**: All script regions inside an SFC are whitespace-masked into a single virtual file parsed in one compiler pass using `ts.ScriptKind.TSX`.
4. **Normalized Output**: AST nodes and extracted SFC block regions are mapped into uniform symbol records dispatched to either `glance` (hierarchical syntactic tree) or `block` (verbatim extraction).

### Why the Official TypeScript Compiler API?
- **Fidelity**: Parses modern ECMAScript/TypeScript syntax (decorators, generics, type parameters, accessor keywords, JSX) with official language specification accuracy.
- **Fast AST Construction**: `ts.createSourceFile` constructs a complete AST in lightweight in-memory data structures without requiring type checking or project-wide program binding.

---

## 3. CST & AST Extraction Engine

### 3.1 Extracted Symbols & Scope
Per the [Design.Skim.md](Design.Skim.md) specification, `skim-ts` outlines top-level module declarations and direct class/interface/enum members. Local helper functions and nested classes within function or method bodies are intentionally omitted to avoid context bloat:

- **Functions**: `function name(...)`, `async function name(...)`, and exported arrow functions assigned to `const` / `let` (`export const handler = (...) => ...`).
- **Classes**: `class Name<T> extends Base implements Interface { ... }`.
- **Class Members**: Constructors, methods (instance and `static`), getters, and setters.
- **Interfaces & Type Aliases**: `interface Config<T> { ... }`, `type Result<T> = ...`.
- **Enums**: `enum Direction { ... }` and `const enum Flags { ... }`.
- **Constants & Variables**: Top-level exported constants and variable statements.

### 3.2 Declarations (`-s`) and Details (`-d`)
- **Signatures (`-s`)**: Strips implementation blocks and renders headers/signatures up to the opening `{` or `;`, including generic type parameters, argument lists, return type annotations, and modifiers (`export`, `default`, `async`, `static`, `abstract`).
- **Details (`-d`)**:
  - **Interfaces & Types**: Member signatures and property definitions (`| <prop>: <type>`).
  - **Classes**: Property fields, parameter properties, and member declarations.
  - **Enums**: Enum variants and initialized values indented under parent enum with `| <member> = <value>`.

### 3.3 Comments, Decorators & Line Spans
Conforms to [Design.Skim.md §3.1.1](Design.Skim.md).
- **No comments in `glance` output**: Signatures (`-s`) and members (`-d`, including interface/type-literal/class/enum members and import lines) are rebuilt from the AST's non-trivia leaf tokens, never sliced from raw source. JSDoc, `//` and `/* */` comments are dropped at any position (inside parameter lists, type parameters, member types, between the return type and `{`), so a `//` comment can no longer swallow the rest of the collapsed one-line signature. Spacing left behind is tidied (`( x` -> `(x`, `x )` -> `x)`).
- **Decorators are not part of signatures** (class, member or parameter decorators).
- **Header end**: the body start, the first `{`/`;` child token of the declaration, or, for arrow functions, the `=>` token. Arrow-function signatures therefore no longer carry a dangling `=>` (`export const f = (x: number): number`).
- **Span rule**: `L<start>-L<end>` (glance and `block`) starts at the first line of the contiguous attached JSDoc (`/** ... */`) block, including decorators, and ends at the declaration's closing line. Only JSDoc counts as a doc comment: contiguous `//` lines and plain `/* */` comments directly above are *not* pulled in, though they do not break the chain (a `// eslint-disable` line between a JSDoc and its declaration stays inside the span). Comments separated by a blank line (detached) and trailing comments after the closing line are excluded.
- SFC scripts go through the same parser, so the rules apply identically inside `.vue`, `.svelte` and `.astro`.
- Test fixture: `fixtures/comments.ts`.

---

## 4. Single File Component (SFC) Support

In modern web codebases, application logic, component state, and prop contracts are frequently authored inside SFCs. `skim-ts` supports `.vue`, `.svelte`, and `.astro` directly without third-party CLI dependencies or heavy template compilation pipelines.

### 4.1 Modular Preprocessing Architecture
All SFC extraction logic is decoupled from the core TypeScript parser and lives in `src/sfc/`:

```text
skim-ts/src/
├── parser.ts            # Pure TypeScript AST walker & signature extractor
└── sfc/
    ├── types.ts         # SfcBlock interface & block kinds
    ├── mask.ts          # Line- and column-preserving whitespace masking
    ├── vue.ts           # Vue extractor (<script>, <script setup>, <template>, <style>)
    ├── svelte.ts        # Svelte extractor (<script>, <script context="module">, <style>)
    ├── astro.ts         # Astro extractor (--- frontmatter, client <script>, <style>)
    └── index.ts         # Dispatcher based on file extension
```

### 4.2 Multi-Block Parsing & Whitespace Masking (`src/sfc/mask.ts`)
To ensure that all line numbers and column offsets in the TypeScript AST match the original SFC on disk 1:1 without coordinate translation tables:
1. **Masking Non-Script Regions**: HTML templates, CSS styles, markup chunks, and tag delimiters (`<script...>`, `</script>`, `---`) are replaced with non-newline whitespace (spaces) while preserving every newline (`\n`).
2. **Single Pass Virtual File**: All script regions in an SFC (e.g. `<script>` and `<script setup>` in Vue, or `<script context="module">` and `<script>` in Svelte) are parsed in a single virtual file using `ts.ScriptKind.TSX`.
3. **Zero Parse Diagnostics**: Syntactically valid duplicate bindings across blocks (resolved semantically by frameworks) are parsed without syntax errors in AST-only mode.
4. **Symbol Attribution**: AST symbols are mapped back to their respective parent SFC script block by line span containment.

### 4.3 Discrete Markup Segment Isolation
In Svelte and Astro components, markup can be interleaved with inlined `<script>` or `<style>` blocks:
- Svelte and Astro extractors track discrete markup segments flanking inlined blocks.
- Non-script markup segments are accurately bounded without subsuming interleaved `<script>` or `<style>` tags.

---

## 5. Key TypeScript Language Nuances

### 5.1 Target Syntax & Member Resolution
`block` retrieves verbatim blocks using TypeScript-idiomatic targets:
- **Canonical Target**: `Class.method` or `Type.member` (e.g. `UserService.getUser`, `UserService.constructor`, `Direction.Up`).
- **Standalone Identifiers**: Functions, classes, interfaces, type aliases, enums, or top-level constants (e.g. `createRouter`, `UserConfig`, `DEFAULT_TIMEOUT`).
- **Resolution Precedence**:
  1. *Exact Case Match*: If both `Config` (type) and `config` (const) exist, exact case wins.
  2. *Case-Insensitive Match*: `userservice.getuser` matches `UserService.getUser`.
  3. *Substring Match*: Falls back to substring matching if no exact or case-insensitive identifier matches.

### 5.2 SFC Section Targets & Semantic Aliases
`block` can target SFC structural sections directly:
- **Universal Semantic Aliases**: `template`, `markup`, and `html` serve as interchangeable aliases:
  - In Vue: extracts `<template>`.
  - In Svelte & Astro: extracts markup sections.
- **Discrete Segment Indexing**: When an SFC contains multiple markup segments interrupted by inlined scripts/styles, targeting `template`, `markup`, or `html` reports ambiguous matches (exit code 3) with guidance to target discrete segments (`markup:1`, `markup:2`, `template:1`, `html:2`).
- **Frontmatter & Tags**:
  - `---` or `frontmatter`: Extracts Astro frontmatter.
  - `script` / `style`: If unambiguous, extracts the single block. If multiple exist (e.g. `<script>` and `<script setup>`, or multiple `<style>` blocks), reports ambiguous candidates with tips to target specific tags or line spans.

### 5.3 Test Filtering by Default
Tests are excluded by default to avoid inflating LLM context windows:
- **File Exclusions**: Excludes `*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx`, `*.test.js`, `*.spec.js`, `*.test.vue`, `*.spec.svelte`, etc., as well as `__tests__/` directories.
- **In-File Exclusions**: Identifies and filters top-level test runner calls (`describe(...)`, `it(...)`, `test(...)`, `suite(...)`) unless `-t` / `--include-tests` is passed.
- **Opt-In (`-t` / `--include-tests`)**: Includes test files and test blocks, annotated with `[test]`.

### 5.4 Outline Formatting & Indentation Hierarchy
`glance` visual output follows standard line spans:

#### Pure TS/JS/TSX/JSX Files
- **Depth 0 (0 spaces)**: Top-level declarations (`interface`, `function`, `class`, `type`, `const`).
- **Depth 1 (2 spaces)**: Class/interface members (`method`, `constructor`, `getter/setter`).
- **Details (`-d`)**: `| <field>` indented under parent type.

#### SFC Files (`.vue`, `.svelte`, `.astro`)
SFC containers (`<script>`, `<template>`, `<style>`, `---`, `markup`) form root sections at Depth 0. Declarations inside script/frontmatter blocks indent by 2 spaces (Depth 1), with their members at Depth 2:

```text
=== src/components/UserProfile.vue (110 lines) ===

Outline:
  L2-L8        <script lang="ts">
  L4-L6          export const DEFAULT_ROLE = 'guest'
  L10-L45      <script setup lang="ts">
  L12-L16        interface Props
  L18-L30        class FormValidator
  L20-L24          method constructor(config: Props)
  L26-L29          method validate(): boolean
  L32-L38        function submitForm()
  L47-L85      <template>
  L87-L110     <style scoped>
```

---

## 6. File & Module Structure

Directory: `skim-ts/`

**Source files in `src/`**:
- `cli.ts`: CLI entry point, argument parsing, error formatting, and standard exit codes.
- `glance.ts`: `glance` subcommand: directory recursion, test filtering, and tree outline rendering.
- `block.ts`: `block` subcommand: target resolution (symbols and SFC sections), line gutters, and `--raw` mode.
- `parser.ts`: Core TypeScript AST parser and visitor using the TypeScript Compiler API.
- `types.ts`: Shared data structures (`OutlineItem`, `ParsedFile`, `Span`).
- `sfc/`: Modular SFC preprocessor:
  - `types.ts`: `SfcBlock` definitions and block kinds.
  - `mask.ts`: Line- and column-preserving whitespace masking.
  - `vue.ts`: Vue template/script/style block extractor.
  - `svelte.ts`: Svelte script/style/markup segment extractor.
  - `astro.ts`: Astro frontmatter/script/style/markup segment extractor.
  - `index.ts`: Unified SFC dispatcher and virtual file mapper.

**Test files in `tests/`**:
- `skim.test.ts`: TypeScript/JavaScript CLI tests (classes, casing precedence, test filtering, enums, broken syntax).
- `sfc.test.ts`: SFC test suite covering Vue, Svelte, Astro extraction, discrete markup segments, semantic aliases, and disambiguation.
- `fixtures/`: Test fixtures including TS sources and SFC components (`fixtures/sfc/`).

---

## 7. Packaging & Distribution Strategy

`skim-ts` is bundled with Bun into a standalone executable script with an embedded shebang:
```bash
bun build ./src/cli.ts --outfile skim-ts --banner '#!/usr/bin/env bun'
chmod +x skim-ts
```

This distribution bundles the `typescript` compiler dependency into a single file while maintaining fast sub-100ms startup times without the binary overhead of `bun build --compile`.
