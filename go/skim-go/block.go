package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type BlockOptions struct {
	File         string
	Target       string
	IncludeTests bool
	Raw          bool
	Details      bool
}

func parseTarget(target string) (bool, string, string) {
	target = strings.TrimSpace(target)
	if strings.Contains(target, ".") {
		parts := strings.Split(target, ".")
		typePart := strings.Trim(parts[0], "()* \t")
		memberPart := strings.Trim(parts[1], "()* \t")
		return true, typePart, memberPart
	}
	return false, "", target
}

func findMatches(items []Item, target string) []Item {
	isQualified, targetType, targetMember := parseTarget(target)

	if isQualified {
		// Target is Type.Method
		var exactMatches []Item
		var ciMatches []Item
		var subMatches []Item

		for _, it := range items {
			if it.Kind != KindMethod {
				continue
			}
			if it.ReceiverType == targetType && it.Name == targetMember {
				exactMatches = append(exactMatches, it)
			} else if strings.EqualFold(it.ReceiverType, targetType) && strings.EqualFold(it.Name, targetMember) {
				ciMatches = append(ciMatches, it)
			} else if strings.Contains(strings.ToLower(it.ReceiverType), strings.ToLower(targetType)) &&
				strings.Contains(strings.ToLower(it.Name), strings.ToLower(targetMember)) {
				subMatches = append(subMatches, it)
			}
		}

		if len(exactMatches) > 0 {
			return exactMatches
		}
		if len(ciMatches) > 0 {
			return ciMatches
		}
		return subMatches
	}

	// Standalone target
	var exactMatches []Item
	var ciMatches []Item
	var subMatches []Item

	for _, it := range items {
		if it.Name == targetMember {
			exactMatches = append(exactMatches, it)
		} else if strings.EqualFold(it.Name, targetMember) {
			ciMatches = append(ciMatches, it)
		} else if strings.Contains(strings.ToLower(it.Name), strings.ToLower(targetMember)) ||
			strings.Contains(strings.ToLower(it.Header), strings.ToLower(targetMember)) {
			subMatches = append(subMatches, it)
		}
	}

	if len(exactMatches) > 0 {
		return exactMatches
	}
	if len(ciMatches) > 0 {
		return ciMatches
	}
	return subMatches
}

func RunBlock(opts BlockOptions) int {
	if _, err := os.Stat(opts.File); err != nil {
		fmt.Fprintf(os.Stderr, "Error: file not found: %s\n", opts.File)
		return 1
	}

	data, err := os.ReadFile(opts.File)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading %s: %v\n", opts.File, err)
		return 1
	}
	content := string(data)

	cwd, _ := os.Getwd()
	relPath := opts.File
	if rel, err := filepath.Rel(cwd, opts.File); err == nil && !strings.HasPrefix(rel, "..") {
		relPath = rel
	}

	parsed, err := ParseGoSource(opts.File, relPath, content)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing %s: %v\n", opts.File, err)
		return 1
	}

	allowTests := opts.IncludeTests || parsed.IsTest
	var candidates []Item
	for _, it := range parsed.Items {
		if !allowTests && it.IsTest {
			continue
		}
		candidates = append(candidates, it)
	}

	matches := findMatches(candidates, opts.Target)

	if len(matches) == 0 {
		fmt.Fprintf(os.Stderr, "Error: target '%s' not found in %s\n", opts.Target, relPath)
		return 1
	}

	if len(matches) > 1 {
		fmt.Fprintf(os.Stderr, "Error: ambiguous target '%s' matched %d candidates in %s:\n", opts.Target, len(matches), relPath)
		for idx, m := range matches {
			span := fmt.Sprintf("L%d-L%d", m.StartLine, m.EndLine)
			fmt.Fprintf(os.Stderr, "  %d) %-10s %s %s\n", idx+1, span, m.Kind, m.QualifiedName)
		}
		fmt.Fprintf(os.Stderr, "\nTip: Disambiguate with Type.Method (e.g. Server.Listen) or read line range directly.\n")
		return 1
	}

	chosen := matches[0]
	if opts.Raw {
		for i := chosen.StartLine; i <= chosen.EndLine && i <= len(parsed.Lines); i++ {
			fmt.Println(parsed.Lines[i-1])
		}
	} else {
		fmt.Printf("=== %s (L%d-L%d) ===\n", relPath, chosen.StartLine, chosen.EndLine)
		for i := chosen.StartLine; i <= chosen.EndLine && i <= len(parsed.Lines); i++ {
			fmt.Printf("%5d | %s\n", i, parsed.Lines[i-1])
		}
	}

	return 0
}
