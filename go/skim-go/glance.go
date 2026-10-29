package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type GlanceOptions struct {
	Signatures   bool
	Details      bool
	Uses         bool
	Filters      []string
	IncludeTests bool
	Paths        []string
}

func collectGoFiles(paths []string, includeTests bool) ([]string, error) {
	var fileList []string
	seen := make(map[string]bool)

	addFile := func(path string) {
		clean := filepath.Clean(path)
		if seen[clean] {
			return
		}
		if !strings.HasSuffix(clean, ".go") {
			return
		}
		if !includeTests && isTestFile(clean) {
			return
		}
		seen[clean] = true
		fileList = append(fileList, clean)
	}

	for _, p := range paths {
		info, err := os.Stat(p)
		if err == nil {
			if info.IsDir() {
				err := filepath.WalkDir(p, func(path string, d os.DirEntry, err error) error {
					if err != nil {
						return err
					}
					name := d.Name()
					if d.IsDir() {
						if strings.HasPrefix(name, ".") && name != "." && name != ".." {
							return filepath.SkipDir
						}
						if name == "vendor" || name == "node_modules" {
							return filepath.SkipDir
						}
						return nil
					}
					addFile(path)
					return nil
				})
				if err != nil {
					fmt.Fprintf(os.Stderr, "Warning: error walking %s: %v\n", p, err)
				}
			} else {
				addFile(p)
			}
			continue
		}

		// Pattern matching
		if strings.ContainsAny(p, "*?[") {
			matches, globErr := filepath.Glob(p)
			if globErr == nil && len(matches) > 0 {
				for _, m := range matches {
					mInfo, err := os.Stat(m)
					if err == nil && mInfo.IsDir() {
						_ = filepath.WalkDir(m, func(path string, d os.DirEntry, err error) error {
							if err == nil && !d.IsDir() {
								addFile(path)
							}
							return nil
						})
					} else if err == nil {
						addFile(m)
					}
				}
				continue
			}
		}

		fmt.Fprintf(os.Stderr, "Warning: path not found: %s\n", p)
	}

	sort.Strings(fileList)
	if len(fileList) == 0 {
		return nil, fmt.Errorf("no .go files found matching input")
	}
	return fileList, nil
}

func matchFilters(item Item, filters []string) bool {
	if len(filters) == 0 {
		return true
	}
	for _, f := range filters {
		fLower := strings.ToLower(f)
		matched := strings.Contains(strings.ToLower(item.Name), fLower) ||
			strings.Contains(strings.ToLower(item.QualifiedName), fLower) ||
			strings.Contains(strings.ToLower(item.Header), fLower) ||
			strings.Contains(strings.ToLower(item.Signature), fLower) ||
			strings.Contains(strings.ToLower(item.BlockText), fLower)

		if !matched {
			for _, d := range item.Details {
				if strings.Contains(strings.ToLower(d), fLower) {
					matched = true
					break
				}
			}
		}

		if !matched {
			return false
		}
	}
	return true
}

func RunGlance(opts GlanceOptions) int {
	files, err := collectGoFiles(opts.Paths, opts.IncludeTests)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		return 1
	}

	cwd, _ := os.Getwd()
	printedFiles := 0

	for _, file := range files {
		contentBytes, err := os.ReadFile(file)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading %s: %v\n", file, err)
			continue
		}
		content := string(contentBytes)

		relPath := file
		if rel, err := filepath.Rel(cwd, file); err == nil && !strings.HasPrefix(rel, "..") {
			relPath = rel
		}

		parsed, err := ParseGoSource(file, relPath, content)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to parse %s: %v\n", file, err)
			continue
		}

		var candidateItems []Item
		for _, it := range parsed.Items {
			if !opts.IncludeTests && it.IsTest {
				continue
			}
			if matchFilters(it, opts.Filters) {
				candidateItems = append(candidateItems, it)
			}
		}

		// When filtering or scanning multiple files, skip files with no matching items
		if len(opts.Filters) > 0 && len(candidateItems) == 0 && len(parsed.SyntaxErrors) == 0 {
			continue
		}
		if len(candidateItems) == 0 && len(parsed.Items) == 0 && len(parsed.SyntaxErrors) == 0 && len(files) > 1 {
			continue
		}

		if printedFiles > 0 {
			fmt.Println()
		}
		printedFiles++

		testTag := ""
		if parsed.IsTest {
			testTag = " [test]"
		}

		errorTag := ""
		if len(parsed.SyntaxErrors) > 0 {
			n := len(parsed.SyntaxErrors)
			if n == 1 {
				errorTag = " [! 1 syntax error]"
			} else {
				errorTag = fmt.Sprintf(" [! %d syntax errors]", n)
			}
		}

		fmt.Printf("=== %s (%d lines)%s%s ===\n", parsed.RelPath, parsed.TotalLines, testTag, errorTag)

		for _, err := range parsed.SyntaxErrors {
			fmt.Printf("  Syntax Notice: L%d: %s\n", err.Line, err.Message)
		}

		if opts.Uses {
			if len(parsed.Imports) > 0 {
				fmt.Println("\nImports:")
				for _, imp := range parsed.Imports {
					fmt.Printf("  %s\n", imp)
				}
			} else {
				fmt.Println("\nImports: (none)")
			}
		}

		fmt.Println("\nOutline:")
		for _, it := range candidateItems {
			span := fmt.Sprintf("L%d-L%d", it.StartLine, it.EndLine)
			label := it.Header
			if opts.Signatures {
				label = it.Signature
			} else if opts.Details && it.Kind == KindType && len(it.Details) > 0 {
				label = it.Signature
			}

			fmt.Printf("  %-12s %s\n", span, label)

			if opts.Details && len(it.Details) > 0 {
				for _, d := range it.Details {
					fmt.Printf("                 | %s\n", d)
				}
			}
		}
	}

	return 0
}
