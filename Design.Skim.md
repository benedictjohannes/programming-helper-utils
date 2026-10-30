# `skim-*` Utilities Family Design Specification

## 1. Motivation & Philosophy

When working with LLMs, AI agents, or terminal workflows, feeding full source files quickly burns through context window and token budget while introducing noise. 

The `skim-*` family provides fast, zero-bloat syntactic outlines and exact block extractors for major programming languages.

### Core Tenets:
1. **Token Conservation**: Default to showing only outlines and signatures. Strip bodies unless explicitly requested.
2. **Test-Blind by Default**: Tests (unit tests, test files, mock suites) bloat context and confuse reasoning when exploring codebases. Filter tests out by default; only show them when `--include-tests` (`-t`) is passed.
3. **Exact Block Retrieval**: Allow agents to fetch full verbatim code blocks using language-native qualified syntax (e.g., `Type.Method` in Go, `Class.method` in TypeScript, `Type::method` in Rust) with line-number gutters or in raw format.
4. **Predictable CLI Interface**: All utilities in the family share the exact same subcommands, flags, and visual layout.

---

## 2. CLI Interface Standard

Every tool in the family (`skim-rs`, `skim-go`, `skim-ts`, `skim-py`) exposes two subcommands:

```
skim-<lang> glance [options] <path>...
skim-<lang> block  [options] <file> <target>
```

All `skim-*` tools outline top-level symbols (functions, classes, structs, types, top-level constants) and direct members (methods, fields, variants). Nested inner functions and local classes defined inside function or method bodies are intentionally omitted across all tools to preserve conciseness and avoid outline bloat.

### 2.1 Subcommand: `glance`
Outlines structures, types, signatures, and line spans across files or directories.

#### Arguments:
- `<path>...`: One or more source files, directories, or globs.

#### Flags:
- `-s, --signatures`: Show function/method signatures and type declarations without bodies.
- `-d, --details`: Show struct fields, interface members, enum variants, and tags.
- `-u, --uses, --imports`: Display top-level imports and dependencies.
- `-f, --filter <text>`: Filter items matching `<text>` (case-insensitive, repeatable for AND matching).
- `-t, --include-tests`: Include test files and test blocks (filtered out by default).

### 2.2 Subcommand: `block`
Extracts the verbatim code block for a given identifier or qualified member.

#### Arguments:
- `<file>`: Path to a single source file.
- `<target>`: Target identifier or qualified member:
  - Standalone item: e.g., `Config`, `process_request`, `UserStore`
  - Qualified member (language-idiomatic):
    - **Go**: `Type.Method` (e.g., `Server.Listen`)
    - **TypeScript**: `Class.method` or `Type.member` (e.g., `UserService.getUser`, `Status.Active`)
    - **Rust**: `Type::method` (e.g., `Settings::explain`)

#### Target Matching Semantics:
1. **Case-Insensitive with Exact-Case Precedence**:
   - Matches are case-insensitive by default so agents are not blocked by minor casing discrepancies.
   - If both exact and case-insensitive candidates exist (e.g., Go's exported `User` vs unexported `user`, or TS `type User` vs `const user`), the exact-case match wins.
   - If no exact or case-insensitive identifier matches, tools fall back to a case-insensitive substring search on declarations.
2. **Receiver Transparency (Go)**:
   - Canonical syntax is `Type.Method`.
   - Matching is transparent to value receivers `func (s Server) Listen()` and pointer receivers `func (s *Server) Listen()`.
   - Tolerates pointer notations in input (`*Server.Listen` or `(*Server).Listen` normalize automatically to `Server.Listen`).

#### Flags:
- `-t, --include-tests`: Search within test files/blocks.
- `--raw`: Print raw code snippet without line numbers.

---

## 3. Output Formatting Standard

### 3.1 `glance` Output Structure

Each file header starts with `=== <relative_path> (<N> lines) ===` (appended with ` [test]` if test file under `-t`), followed by optional imports and outline blocks.

```text
=== src/service.ts (145 lines) ===

Imports:
  import { Request, Response } from "express";
  import { Database } from "./db";

Outline:
  L12-L18      interface UserConfig
  L20-L45      class UserService
  L25-L30        method constructor(db: Database)
  L32-L44        method getUser(id: string): Promise<User>
  L48-L60      function createRouter(): Router
```

Rules:
- Line spans are left-padded to 12 characters: `  L<start>-L<end>   <kind> <name_or_signature>`.
- Nested items (e.g. methods inside a class, fields inside a struct with `-d`) are indented under the parent with `| <member>`.
- If `-s` is active, the full signature is printed.
- If `-d` is active, field definitions (or enum members) are printed indented under the type.

### 3.2 `block` Output Structure

#### Default (Gutter with Line Numbers):
```text
=== src/service.ts (L32-L44) ===
   32 |   async getUser(id: string): Promise<User> {
   33 |     const user = await this.db.find(id);
   34 |     if (!user) {
   35 |       throw new NotFoundError();
   36 |     }
   37 |     return user;
   38 |   }
```

#### Raw (`--raw`):
```typescript
  async getUser(id: string): Promise<User> {
    const user = await this.db.find(id);
    if (!user) {
      throw new NotFoundError();
    }
    return user;
  }
```

#### Ambiguity Handling:
If multiple targets match:
```text
Error: ambiguous target 'getUser' matched 2 candidates in src/service.ts:
  1) L32-L44   method UserService.getUser
  2) L75-L82   method AdminService.getUser

Tip: Disambiguate with Class.method (e.g. UserService.getUser) or read line range directly.
```
*(Tip adapts to the language syntax: `Type.Method` for Go, `Class.method` for TS, `Type::method` for Rust).*

---

### 3.3 Syntax Error Resilience & In-Flight Diagnostics

Codebases explored by AI agents are frequently in the middle of refactorings or incomplete edits. Rather than failing outright on syntax errors, tools in the `skim-*` family should leverage error-resilient AST/CST parsers where possible (e.g. `ra_ap_syntax` for Rust):

1. **Header Annotation**: If syntax errors are present, the file header reflects the count:
   ```text
   === src/broken.rs (13 lines) [! 1 syntax error] ===
   ```
2. **Syntax Notices in Glance**: Under the file header, list the error line and message so the agent immediately knows why code might be malformed without halting outlining:
   ```text
     Syntax Notice: L6: expected SEMICOLON
   ```
3. **Syntax Notices in Block**: If an extracted block contains a syntax error within its line span, display the notice above the block:
   ```text
   === src/broken.rs (L5-L8) [! 1 syntax error] ===
     Syntax Notice: L6: expected SEMICOLON
       5 | fn broken_function() {
       6 |     let x = 10
       7 |     let y = 20;
       8 | }
   ```
4. **Non-Crashing Outlines**: Valid declarations before and after the syntax error are still outlined and retrievable via `block`.

---

## 4. Exit Codes Standard

All `skim-*` tools conform to standard exit codes:

| Code | Meaning | Description |
|:---:|:---|:---|
| `0` | **Success** | Command completed normally. |
| `1` | **Error** | File/path not found, I/O error, or invalid CLI flag. |
| `2` | **Not Found** | Specified target symbol was not found in the file (`block` subcommand). |
| `3` | **Ambiguous** | Target matched multiple candidates; disambiguation required (`block` subcommand). |

---

## 5. Agent Workflow Recommendation

LLM agents operating on codebases should follow this loop:
1. **Survey / Outline**: Run `skim-<lang> glance <path> -s` to understand file structure without wasting tokens.
2. **Search / Filter**: Run `skim-<lang> glance <path> -f <keyword>` to locate relevant methods or types.
3. **Inspect Code**: Run `skim-<lang> block <file> <Target>` or inspect specific line spans reported by `glance`.
