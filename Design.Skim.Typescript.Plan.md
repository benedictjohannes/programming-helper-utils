# Plan: `skim-ts`

## 1. Objective
Build a fast, AST-based TypeScript/JavaScript outline and code block extractor conforming to [Design.Skim.md](Design.Skim.md).

## 2. Architecture & Technologies
- **Location**: `typescript/skim-ts`
- **Engine**: Official TypeScript Compiler API (`typescript` npm package).
- **Runtime & Bundler**: Bun (`bun build`).
- **AST Parsing**:
  - `ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, scriptKind)`
  - Supports `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`.
- **Traversal**:
  - `ts.forEachChild` / recursive visitor plucking declarations:
    - `ClassDeclaration`, `InterfaceDeclaration`, `TypeAliasDeclaration`, `EnumDeclaration`
    - `FunctionDeclaration`, `VariableStatement` (exported const arrow functions / components)
    - `MethodDeclaration`, `ConstructorDeclaration`, `GetAccessor`, `SetAccessor`

## 3. Key Language Nuances for TypeScript

### Test Handling (Filtered out by default)
- When glancing directories or patterns, automatically exclude `*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx`, and `__tests__/` directories unless `-t` / `--include-tests` is passed.
- In-file test suites: identify top-level calls to `describe()`, `it()`, `test()`, `suite()` and filter out unless `-t` is passed.

### Target Syntax & Resolution (`Class.method` / `Type.member`)
- **Canonical Syntax**: `Class.method` or `Type.member` (e.g., `UserService.getUser`, `UserService.constructor`, `Status.Active`).
- **Matching Semantics**:
  - Case-insensitive by default with exact-case precedence (e.g., `userservice.getuser` matches `UserService.getUser`; exact case preferred if type and value names share casing).
  - Fallback to substring matching if neither exact nor case-insensitive identifier matches.
- **Standalone Identifiers**: functions, interfaces, type aliases, enums, constants (e.g., `createRouter`, `UserConfig`).

### Declarations & Signatures (`-s`)
- Print headers and signatures up to opening `{` or `;`.
- Handle exported modifiers (`export`, `default`, `async`).
- Show generic type parameters (e.g., `<T extends Record<string, any>>`).

### Details Flag (`-d`)
- Interfaces & Types: list property signatures and method signatures.
- Classes: list field properties.
- Enums: list enum members and values.

### Output Formatting
- `glance`: `=== <path> (<N> lines) ===` with left-padded line spans `  L<start>-L<end>   <kind> <header>`.
- `block`: `=== <path> (L<start>-L<end>) ===` with 5-digit right-aligned gutter (`%5d | %s`) or `--raw`.
- Ambiguity tip: `Tip: Disambiguate with Class.method (e.g. UserService.getUser) or read line range directly.`

## 4. Verification & Testing Strategy

### Step 1: Smoke Testing (First — Rapid Validation)
Build or bundle the executable script (`skim-ts` in `typescript/skim-ts/`), then execute from within the target repository (`cwd = testingRepositories/zod`, cloning colinhacks/zod):
```bash
# In cwd = testingRepositories/typescript:
../../typescript/skim-ts/skim-ts glance src/types.ts -s -u
../../typescript/skim-ts/skim-ts glance src/ -s -f "ZodType"

# Block extraction:
../../typescript/skim-ts/skim-ts block src/types.ts ZodType.parse
../../typescript/skim-ts/skim-ts block src/types.ts zodtype.parse
../../typescript/skim-ts/skim-ts block src/types.ts ZodType.constructor
../../typescript/skim-ts/skim-ts block src/types.ts ZodType --raw

# Test exclusion check:
../../typescript/skim-ts/skim-ts glance src/ -s -f "test"
../../typescript/skim-ts/skim-ts glance src/ -s -f "test" -t
```

### Step 2: In-Tree Fixtures & Automated Unit Tests (Last — Hardening)
Create a `fixtures/` directory inside `typescript/skim-ts/` containing crafted TS sources covering edge cases:
- `fixtures/classes.ts`: Classes with static vs instance methods, getters/setters, constructors.
- `fixtures/casing.ts`: Type `Config` vs const `config` to test exact-case precedence.
- `fixtures/tests.ts`: Mixed `describe()` / `test()` blocks with regular helper functions.
- `fixtures/enums.ts`: Numeric and string enums with `-d`.
- Automate assertions via `bun test`.

## 5. Packaging & Distribution Strategy
- **Lean Executable Script**:
  - Bundle via Bun into a single self-contained JS file with a shebang:
    ```bash
    bun build ./src/cli.ts --outfile skim-ts --banner '#!/usr/bin/env bun'
    chmod +x skim-ts
    ```
  - Eliminates the binary overhead of `bun build --compile` while preserving sub-100ms startup times and bundling the `typescript` compiler dependency into a single file.

---

# Support for SFC Plan

## 1. Overview & Motivation
Expand `skim-ts` to support Single File Components (SFCs):
- **Vue** (`.vue`)
- **Svelte** (`.svelte`)
- **Astro** (`.astro`)

In modern frontend and full-stack projects, core application logic, component state, and prop interfaces are frequently authored in SFCs. By embedding SFC support directly into `skim-ts`, agents can explore, outline, and extract component symbols across mixed TS/SFC repositories without requiring a separate tool or suffering context bloat from raw HTML templates and CSS styles.

---

## 2. Supported Extensions & Test Filtering
- **Extensions**: Add `.vue`, `.svelte`, and `.astro` to `SUPPORTED_EXTS`.
- **Test File Detection**: Exclude `*.test.vue`, `*.spec.vue`, `*.test.svelte`, `*.spec.svelte`, etc., by default unless `-t` / `--include-tests` is passed.

---

## 3. Architecture & Modular Preprocessing

To preserve separation of concerns and avoid coupling the core TypeScript AST engine to HTML/SFC parsing, all SFC handling lives in a dedicated `src/sfc/` module. `parser.ts` remains responsible strictly for pure TypeScript AST parsing.

```text
typescript/skim-ts/src/
├── parser.ts            # Pure TypeScript AST walker & signature extractor
└── sfc/
    ├── types.ts         # SfcBlock interface & block kinds
    ├── mask.ts          # Line- and column-preserving whitespace masking
    ├── vue.ts           # Vue extractor (<script>, <script setup>, <template>, <style>)
    ├── svelte.ts        # Svelte extractor (<script>, <script context="module">, <style>)
    ├── astro.ts         # Astro extractor (--- frontmatter, client <script>, <style>)
    └── index.ts         # Dispatcher based on file extension (.vue, .svelte, .astro)
```

### Data Structures (`src/sfc/types.ts`):
```ts
export interface SfcBlock {
  tag: string;              // Verbatim header, e.g. '<script setup lang="ts">', '---', '<template>', '<style scoped>'
  name: string;             // Canonical name: 'script', 'script:setup', 'template', 'style', '---'
  kind: 'script' | 'template' | 'style' | 'frontmatter';
  lang: 'ts' | 'tsx' | 'js';
  startLine: number;
  endLine: number;
  startPos: number;
  endPos: number;
  contentStartPos: number;  // Inner content byte offset
  contentEndPos: number;    // Inner content byte offset
}
```

---

## 4. Multi-Block Parsing & Coordinate Fidelity

### 4.1 Unified Single Virtual File Parsing
Instead of producing multiple virtual files and invoking the compiler repeatedly, all script regions in an SFC are parsed in a **single pass** within a single virtual TypeScript file:
- **Vue**: `<script>` and `<script setup>` reside together in the same virtual file.
- **Svelte**: `<script context="module">` and `<script>` reside together in the same virtual file.
- **Astro**: `---` frontmatter (and any TypeScript `<script>` blocks) reside in the same virtual file.

Why a single unified virtual file is optimal:
1. **Performance**: Exactly one `ts.createSourceFile` AST pass per SFC, matching the fast execution profile of pure `.ts` files.
2. **Syntactically Valid**: Duplicate declarations across blocks (e.g. `const foo` in `<script>` and `const foo` in `<script setup>`) are semantic/type-checking concerns, not syntax errors. `ts.createSourceFile` parses all declarations into valid AST nodes without parse diagnostics.
3. **Natural Cross-Block Scope**: Reflects framework reality where `<script setup>` inherits module imports and top-level types from `<script>`.
4. **Universal `ScriptKind`**: Virtual files use `ts.ScriptKind.TSX`, which transparently supports TypeScript, JavaScript, and embedded JSX constructs.

### 4.2 Whitespace Masking (`src/sfc/mask.ts`)
To ensure that all line numbers and column offsets in the TypeScript AST match the original SFC file on disk 1:1 without complex index translation:
- Non-script regions (templates, styles, HTML markup) and tag delimiters (`<script...>`, `</script>`, `---`) are masked by replacing non-newline characters with spaces while preserving all newline characters (`\n`).
- AST nodes generated by `ts.createSourceFile` map directly to the original file offsets on disk.
- Symbols parsed from the AST are mapped back to their enclosing script block by checking line spans.

---

## 5. Output Formatting & CLI Semantics

### 5.1 Verbatim Section Titles
Section titles are preserved verbatim as authored in the source file:
- `---` remains `---` (never renamed to `<script>` or abstracted).
- `<script setup lang="ts">` retains its exact attributes (`lang`, `setup`, `generic`, `context="module"`).
- `<style scoped>`, `<style module>`, etc., retain their exact attributes.
- `<template>` retains its exact tag.

### 5.2 `glance` Formatting & Indentation Hierarchy
Indentation strictly follows **2 spaces per depth level** (`'  '.repeat(depth)`) after the left-padded line span (`  ${span.padEnd(12, ' ')} ${childIndent}${label}`).

#### Pure TS/JS/TSX/JSX Files (Preserved Unchanged):
Pure TypeScript/JavaScript files retain their standard flat root structure:
- **Depth 0 (0 spaces)**: Top-level declarations (`interface`, `function`, `class`, `type`, `const`).
- **Depth 1 (2 spaces)**: Class and interface members (`method`, `constructor`, `getter/setter`).
- **Details (`-d`)**: `| <field>` indented under parent type.

#### SFC Files (`.vue`, `.svelte`, `.astro`):
Because the SFC containers (`<script>`, `<template>`, `<style>`, `---`) form the root elements (Depth 0), declarations inside the script/frontmatter blocks naturally indent by 2 spaces (Depth 1), with their members at Depth 2:

| Depth | Indentation | Scope in SFC | Examples in SFC |
| :---: | :---: | :--- | :--- |
| **0** | `0` spaces | **SFC Root blocks** | `<script lang="ts">`, `<template>`, `<style scoped>`, `---` |
| **1** | `2` spaces | **Script declarations** | `interface Props`, `function submit()`, `class FormValidator`, `const count` |
| **2** | `4` spaces | **Class / Interface members** | `method validate()`, `method constructor()` |
| **`-d`** | `\| <field>` | **Struct/Enum/Class fields** | Indented under the parent type with `\| <field>` |

#### Visual Example:
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

For Svelte and Astro:
- Explicit blocks (`<script>`, `---`, `<style>`) and top-level markup sections (`markup`, or `markup:1`, `markup:2` when split around scripts/styles) are outlined at Depth 0 chronologically.
- Declarations within script/frontmatter blocks are indented at Depth 1 (and Depth 2 for members).
- Non-script markup segments are accurately bounded without subsuming interleaved `<script>` or `<style>` blocks.

### 5.3 `block` Target Resolution
1. **Symbols**: Targeting a function, class, type, interface, or variable extracts the block directly from the script.
2. **Sections**:
   - `template` / `markup` / `html`: Universal semantic aliases. Extracts `<template>` (Vue) or `markup` (Svelte/Astro). If multiple discrete markup segments exist (e.g. interrupted by inlined `<script>` or `<style>`), returns ambiguous matches conforming to exit code 3 with tips to target numbered segments (`markup:1`, `markup:2`).
   - Direct indexed access: `markup:1`, `markup:2`, `template:1`, `html:2` directly extracts the specific discrete segment.
   - `---` or `frontmatter`: Extracts Astro frontmatter.
   - `script` / `style`: If unambiguous, extracts the single block. If multiple exist (e.g. `<script>` and `<script setup>`, or multiple `<style>` blocks), reports ambiguous matches conforming to standard exit code 3 with tips to target specific tags or line spans.

---

## 6. Verification & Test Plan

### Test Fixtures (`typescript/skim-ts/fixtures/sfc/`):
- `fixtures/sfc/vue-dual-script.vue`: Contains both `<script>` and `<script setup lang="ts">`, duplicate variable names, `<template>`, and multiple `<style>` blocks (scoped and module).
- `fixtures/sfc/svelte-runes.svelte`: Contains `<script context="module">`, instance `<script lang="ts">` with Svelte 5 runes (`$state`, `$props`), markup, and `<style>`.
- `fixtures/sfc/astro-page.astro`: Contains `---` frontmatter, TypeScript interface/fetch logic, client `<script>`, markup, and `<style is:global>`.
- `fixtures/sfc/astro-interleaved.astro`: Contains `---` frontmatter, `<head>` markup (Chunk 1), inlined client `<script is:inline>`, `<body>` markup (Chunk 2), and `<style>`.

### Unit Tests (`typescript/skim-ts/tests/sfc.test.ts`):
1. **Extraction Accuracy**: Verify `vue.ts`, `svelte.ts`, and `astro.ts` correctly extract block boundaries, line spans, and attributes.
2. **Masking Fidelity**: Assert that virtual masked strings maintain exact character counts, line counts, and byte offsets.
3. **Glance Outlines**: Verify nested symbol indentation, verbatim tag rendering, and discrete markup outlining flanking inlined scripts.
4. **Block Resolution & Disambiguation**: Verify targeting symbols, sections (`template`, `markup`, `html`, `---`), indexed segments (`markup:1`, `markup:2`), and ambiguity handling when multiple script/style/markup blocks exist.

---

## 7. Implementation Status
- [x] Dedicated modular preprocessing engine in `src/sfc/` (`types.ts`, `mask.ts`, `vue.ts`, `svelte.ts`, `astro.ts`, `index.ts`).
- [x] Discrete markup segment extraction preventing boundary corruption across inlined scripts/styles.
- [x] Whitespace masking ensuring 100% byte offset and line coordinate fidelity.
- [x] Multi-script virtual file AST parsing using `ts.ScriptKind.TSX`.
- [x] Verbatim section headers and 2-space depth hierarchy in `glance`.
- [x] Universal semantic aliases (`template`, `markup`, `html`) and indexed targeting (`markup:1`, `markup:2`) in `block`.
- [x] Surgical symbol and section (`template`, `---`, `frontmatter`, `script`, `style`) resolution in `block`.
- [x] Test file detection supporting `*.test.vue`, `*.spec.svelte`, etc.
- [x] In-tree test fixtures in `fixtures/sfc/` and comprehensive test coverage in `tests/sfc.test.ts` (53/53 passing tests).
- [x] Compiled `skim-ts` binary built, verified, and operational.
