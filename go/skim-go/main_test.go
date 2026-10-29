package main

import (
	"bytes"
	"io"
	"os"
	"strings"
	"testing"
)

// captureOutput captures stdout and stderr during fn execution.
func captureOutput(fn func() int) (stdout string, stderr string, exitCode int) {
	oldStdout := os.Stdout
	oldStderr := os.Stderr

	rOut, wOut, _ := os.Pipe()
	rErr, wErr, _ := os.Pipe()

	os.Stdout = wOut
	os.Stderr = wErr

	code := fn()

	wOut.Close()
	wErr.Close()

	os.Stdout = oldStdout
	os.Stderr = oldStderr

	var outBuf, errBuf bytes.Buffer
	_, _ = io.Copy(&outBuf, rOut)
	_, _ = io.Copy(&errBuf, rErr)

	return outBuf.String(), errBuf.String(), code
}

func TestReceiversExtraction(t *testing.T) {
	// Value receiver
	out, errOut, code := captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/receivers.go",
			Target: "Server.ValueReceiverMethod",
			Raw:    true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d, stderr: %s", code, errOut)
	}
	if !strings.Contains(out, "func (s Server) ValueReceiverMethod() string") {
		t.Errorf("unexpected output: %s", out)
	}

	// Pointer receiver with canonical syntax
	out, errOut, code = captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/receivers.go",
			Target: "Server.PointerReceiverMethod",
			Raw:    true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d, stderr: %s", code, errOut)
	}
	if !strings.Contains(out, "func (s *Server) PointerReceiverMethod() string") {
		t.Errorf("unexpected output: %s", out)
	}

	// Pointer receiver with (*Server).Method syntax
	out, errOut, code = captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/receivers.go",
			Target: "(*Server).PointerReceiverMethod",
			Raw:    true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d, stderr: %s", code, errOut)
	}
	if !strings.Contains(out, "func (s *Server) PointerReceiverMethod() string") {
		t.Errorf("unexpected output: %s", out)
	}

	// Value receiver with *Server.Method syntax
	out, errOut, code = captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/receivers.go",
			Target: "*Server.ValueReceiverMethod",
			Raw:    true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d, stderr: %s", code, errOut)
	}
	if !strings.Contains(out, "func (s Server) ValueReceiverMethod() string") {
		t.Errorf("unexpected output: %s", out)
	}

	// Case-insensitivity: server.pointerreceivermethod
	out, errOut, code = captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/receivers.go",
			Target: "server.pointerreceivermethod",
			Raw:    true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d, stderr: %s", code, errOut)
	}
	if !strings.Contains(out, "func (s *Server) PointerReceiverMethod() string") {
		t.Errorf("unexpected output: %s", out)
	}
}

func TestAmbiguityAndDisambiguation(t *testing.T) {
	// Standalone "ValueMethod" matches Server.ValueMethod and Client.ValueMethod
	_, errOut, code := captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/receivers.go",
			Target: "ValueMethod",
		})
	})
	if code == 0 {
		t.Fatalf("expected non-zero code for ambiguous target, got 0")
	}
	if !strings.Contains(errOut, "Error: ambiguous target 'ValueMethod' matched 2 candidates") {
		t.Errorf("expected ambiguous error message, got: %s", errOut)
	}
	if !strings.Contains(errOut, "Server.ValueMethod") || !strings.Contains(errOut, "Client.ValueMethod") {
		t.Errorf("expected candidates listed in stderr, got: %s", errOut)
	}
	if !strings.Contains(errOut, "Tip: Disambiguate with Type.Method") {
		t.Errorf("expected tip in stderr, got: %s", errOut)
	}

	// Disambiguated target Server.ValueMethod
	out, _, code := captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/receivers.go",
			Target: "Server.ValueMethod",
			Raw:    true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if !strings.Contains(out, "return \"value\"") {
		t.Errorf("unexpected output: %s", out)
	}

	// Disambiguated target Client.ValueMethod
	out, _, code = captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/receivers.go",
			Target: "Client.ValueMethod",
			Raw:    true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if !strings.Contains(out, "return \"client\"") {
		t.Errorf("unexpected output: %s", out)
	}
}

func TestCasingPrecedence(t *testing.T) {
	// Exact match "Item" should pick type Item, not var item
	out, _, code := captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/casing.go",
			Target: "Item",
			Raw:    true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if !strings.Contains(out, "type Item struct") {
		t.Errorf("expected type Item struct, got: %s", out)
	}

	// Exact match "item" should pick var item, not type Item
	out, _, code = captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/casing.go",
			Target: "item",
			Raw:    true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if !strings.Contains(out, "var item = 42") {
		t.Errorf("expected var item = 42, got: %s", out)
	}

	// Non-exact case "ITEM" should detect ambiguity between Item and item
	_, errOut, code := captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/casing.go",
			Target: "ITEM",
		})
	})
	if code != 3 {
		t.Fatalf("expected ambiguity exit code 3 for ITEM, got code %d", code)
	}
	if !strings.Contains(errOut, "Error: ambiguous target 'ITEM' matched 2 candidates") {
		t.Errorf("expected ambiguity error for ITEM, got: %s", errOut)
	}

	// Target not found should exit with code 2
	_, errNotFound, codeNotFound := captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/casing.go",
			Target: "NonExistentIdentifier",
		})
	})
	if codeNotFound != 2 {
		t.Fatalf("expected not found exit code 2, got code %d", codeNotFound)
	}
	if !strings.Contains(errNotFound, "Error: target 'NonExistentIdentifier' not found") {
		t.Errorf("expected not found error message, got: %s", errNotFound)
	}
}

func TestTestsFiltering(t *testing.T) {
	// Without -t: Test*, Benchmark*, Example*, Fuzz* are filtered out
	out, _, code := captureOutput(func() int {
		return RunGlance(GlanceOptions{
			Paths:        []string{"testdata/tests.go"},
			IncludeTests: false,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if strings.Contains(out, "TestNormalFunc") {
		t.Errorf("expected TestNormalFunc to be omitted without -t")
	}
	if strings.Contains(out, "BenchmarkNormalFunc") {
		t.Errorf("expected BenchmarkNormalFunc to be omitted without -t")
	}
	if strings.Contains(out, "ExampleNormalFunc") {
		t.Errorf("expected ExampleNormalFunc to be omitted without -t")
	}
	if strings.Contains(out, "FuzzNormalFunc") {
		t.Errorf("expected FuzzNormalFunc to be omitted without -t")
	}
	if !strings.Contains(out, "func NormalFunc") {
		t.Errorf("expected NormalFunc to be present")
	}
	if !strings.Contains(out, "func TestingHelper") {
		t.Errorf("expected TestingHelper to be present")
	}

	// With -t: all test functions are included
	out, _, code = captureOutput(func() int {
		return RunGlance(GlanceOptions{
			Paths:        []string{"testdata/tests.go"},
			IncludeTests: true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if !strings.Contains(out, "func TestNormalFunc") {
		t.Errorf("expected TestNormalFunc to be included with -t")
	}
	if !strings.Contains(out, "func BenchmarkNormalFunc") {
		t.Errorf("expected BenchmarkNormalFunc to be included with -t")
	}
	if !strings.Contains(out, "func ExampleNormalFunc") {
		t.Errorf("expected ExampleNormalFunc to be included with -t")
	}
	if !strings.Contains(out, "func FuzzNormalFunc") {
		t.Errorf("expected FuzzNormalFunc to be included with -t")
	}
}

func TestDetailsAndTags(t *testing.T) {
	out, _, code := captureOutput(func() int {
		return RunGlance(GlanceOptions{
			Paths:   []string{"testdata/tags.go"},
			Details: true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if !strings.Contains(out, "| ID int64 `json:\"id\" db:\"user_id\" validate:\"required\"`") {
		t.Errorf("expected ComplexUser ID field tag, got: %s", out)
	}
	if !strings.Contains(out, "| Username string `json:\"username,omitempty\" db:\"user_name\"`") {
		t.Errorf("expected ComplexUser Username field tag, got: %s", out)
	}
	if !strings.Contains(out, "| Greet(name string) (greeting string, err error)") {
		t.Errorf("expected Greeter Greet method, got: %s", out)
	}
	if !strings.Contains(out, "| Bye()") {
		t.Errorf("expected Greeter Bye method, got: %s", out)
	}
}

func TestGutterAndRawFormatting(t *testing.T) {
	// Gutter format
	out, _, code := captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/casing.go",
			Target: "Item",
			Raw:    false,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if !strings.Contains(out, "=== testdata/casing.go (L3-L5) ===") {
		t.Errorf("expected header with line span, got: %s", out)
	}
	if !strings.Contains(out, "    3 | type Item struct {") {
		t.Errorf("expected 5-digit right-aligned gutter, got: %s", out)
	}

	// Raw format
	out, _, code = captureOutput(func() int {
		return RunBlock(BlockOptions{
			File:   "testdata/casing.go",
			Target: "Item",
			Raw:    true,
		})
	})
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if strings.Contains(out, "===") {
		t.Errorf("raw format must not contain header, got: %s", out)
	}
	if strings.Contains(out, "|") {
		t.Errorf("raw format must not contain gutter, got: %s", out)
	}
	if !strings.Contains(out, "type Item struct {") {
		t.Errorf("expected raw code snippet, got: %s", out)
	}
}
