# Plan: `skim-go`

## 1. Objective
Build a fast, dependency-free Go outline and code block extractor conforming to [Design.md](Design.md).

## 2. Architecture & Technologies
- **Location**: `go/skim-go/`
- **Language**: Go (Standard Library only, zero 3rd-party dependencies)
- **Core Packages**:
  - `go/parser`: Parsing Go files into AST (`parser.ParseComments`).
  - `go/ast`: Inspecting declarations (`*ast.FuncDecl`, `*ast.GenDecl`, `*ast.TypeSpec`).
  - `go/token`: Managing file sets, position offsets, and line spans (`*token.FileSet`).
  - `go/printer`: Cleanly formatting signatures and types without function bodies.

## 3. Key Language Nuances for Go

### Test Handling (Filtered out by default)
- When scanning directories or patterns, automatically exclude `*_test.go` files unless `-t` / `--include-tests` is passed.
- Inside single files, identify test functions (`func TestXxx`, `func BenchmarkXxx`, `func ExampleXxx`, `func FuzzXxx`) and filter them unless `-t` is passed.

### Target Syntax & Resolution (`Type.Method`)
- **Canonical Syntax**: `Type.Method` (e.g., `Server.Listen`).
- **Receiver Transparency**:
  - Receiver unwrapping: when inspecting `*ast.FuncDecl.Recv`, unwrap `*ast.StarExpr` or `*ast.Ident` to resolve the base type identifier.
  - Both value receivers `func (s Server) Listen()` and pointer receivers `func (s *Server) Listen()` are matched identically by `Server.Listen`.
  - Input normalization: tolerate `(*Server).Listen` or `*Server.Listen` by stripping `*` and parentheses.
- **Matching Semantics**:
  - Case-insensitive by default with exact-case precedence (e.g., `server.listen` matches `Server.Listen`; exact case preferred if both exported and unexported identifiers coexist).
  - Fallback to substring matching if neither exact nor case-insensitive identifier matches.
- **Standalone Identifiers**: functions, types, constants, and variables match directly (e.g., `NewServer`, `Config`).

### Declarations & Signatures (`-s`)
- Functions & Methods: `func (s *Server) Handle(req *Request) (*Response, error)`
- Types: `type Config struct`, `type Runner interface`, `type ID string`
- Constants & Variables: `const MaxRetries = 5`, `var ErrNotFound = ...`

### Details Flag (`-d`)
- Structs: List fields, types, and struct tags (e.g., ``json:"id" db:"user_id"``).
- Interfaces: List interface method signatures.

### Output Formatting
- `glance`: `=== <path> (<N> lines) ===` with left-padded line spans `  L<start>-L<end>   <kind> <header>`.
- `block`: `=== <path> (L<start>-L<end>) ===` with 5-digit right-aligned gutter (`%5d | %s`) or `--raw`.
- Ambiguity tip: `Tip: Disambiguate with Type.Method (e.g. Server.Listen) or read line range directly.`

## 4. Verification & Testing Strategy

### Step 1: Smoke Testing (First — Rapid Validation)
Build the binary (`go build -o skim-go .` in `go/skim-go/`), then execute from within the target repository (`cwd = testingRepositories/gin`, cloning gin-gonic/gin):
```bash
# In cwd = testingRepositories/go:
../../go/skim-go/skim-go glance gin.go -s -u
../../go/skim-go/skim-go glance . -s -f "Context"

# Block extraction:
../../go/skim-go/skim-go block context.go Context.JSON
../../go/skim-go/skim-go block gin.go engine.run
../../go/skim-go/skim-go block gin.go Engine -d

# Test exclusion check (verify *_test.go and Test* functions omitted without -t):
../../go/skim-go/skim-go glance . -s -f "Test"
../../go/skim-go/skim-go glance . -s -f "Test" -t
```

### Step 2: In-Tree Fixtures & Automated Unit Tests (Last — Hardening)
Create a `testdata/` directory inside `go/skim-go/` containing crafted Go sources covering edge cases:
- `testdata/receivers.go`: Pointer vs. value receivers with identical base types.
- `testdata/casing.go`: Exported `Item` vs unexported `item` to verify exact-case precedence.
- `testdata/tests.go`: Mixed test functions and normal functions.
- `testdata/tags.go`: Complex struct tags with `-d`.
- Automate assertions via standard `go test ./...`.

## 5. Packaging & Distribution
- Standard `go build -o skim-go` in `go/skim-go/`.
- Yields a static binary with zero external dependencies and near-instant execution.
