# Plan: `skim-ts`

## 1. Objective
Build a fast, AST-based TypeScript/JavaScript outline and code block extractor conforming to [Design.md](Design.md).

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
Build or bundle the executable script (`skim-ts` in `typescript/skim-ts/`), then execute from within the target repository (`cwd = testingRepositories/typescript`, a clone of colinhacks/zod):
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
