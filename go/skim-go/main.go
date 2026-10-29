package main

import (
	"fmt"
	"os"
	"strings"
)

const UsageDoc = `skim-go: Fast Go outline & block extractor without test bloat.
Prefer this over reading entire .go files to preserve token context.

Usage:
  skim-go glance [options] <path>...
  skim-go block  [options] <file> <target>

glance:
  Outline structure, signatures, and line ranges across files/directories.

  Usage:
    skim-go glance [options] <path>...

  Arguments:
    <path>...                 One or more .go files, directories, or globs

  Options:
    -s, --signatures          Show declarations & types without function bodies
    -d, --details             Show struct fields and interface members
    -u, --uses, --imports     Display top-level imports
    -f, --filter <text>       Filter items containing <text> (case-insensitive, repeatable)
    -t, --include-tests       Include test files and test functions

  Examples:
    skim-go glance gin.go
    skim-go glance . -s -u
    skim-go glance . -s -f "Context"

block:
  Extract verbatim code block for a type, function, or Type.Method.

  Usage:
    skim-go block [options] <file> <target>

  Arguments:
    <file>                    Path to the .go file
    <target>                  Name of type, func, const, var, or Type.Method

  Options:
    -t, --include-tests       Search inside test functions
    --raw                     Omit line number gutter
    -d, --details             Accepted for compatibility

  Examples:
    skim-go block gin.go Engine
    skim-go block gin.go engine.run
    skim-go block context.go Context.JSON --raw

  Disambiguation:
    If multiple items match, qualify Type.Method (e.g. Server.Listen) or read line range directly.

Agent Operational Workflow:
  1. Glance first:   skim-go glance <path> -s
  2. Locate logic:   skim-go glance <path> -f <keyword>
  3. Inspect code:   Use block <file> <Type.Method>, or read reported line spans (Lxx-Lyy)
`

func printUsage() {
	fmt.Print(UsageDoc)
}

func parseGlanceArgs(args []string) (*GlanceOptions, bool) {
	opts := &GlanceOptions{}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "-h" || arg == "--help" || arg == "help":
			printUsage()
			return nil, false
		case arg == "-s" || arg == "--signatures":
			opts.Signatures = true
		case arg == "-d" || arg == "--details":
			opts.Details = true
		case arg == "-u" || arg == "--uses" || arg == "--imports":
			opts.Uses = true
		case arg == "-t" || arg == "--include-tests":
			opts.IncludeTests = true
		case arg == "-f" || arg == "--filter":
			if i+1 < len(args) {
				i++
				opts.Filters = append(opts.Filters, args[i])
			} else {
				fmt.Fprintln(os.Stderr, "Error: flag -f/--filter requires an argument")
				return nil, false
			}
		case strings.HasPrefix(arg, "-f="):
			opts.Filters = append(opts.Filters, strings.TrimPrefix(arg, "-f="))
		case strings.HasPrefix(arg, "--filter="):
			opts.Filters = append(opts.Filters, strings.TrimPrefix(arg, "--filter="))
		case strings.HasPrefix(arg, "-"):
			// Check for combined short flags like -su, -sd, -suf, etc.
			combined := strings.TrimPrefix(arg, "-")
			isCombined := true
			for _, ch := range combined {
				if ch != 's' && ch != 'd' && ch != 'u' && ch != 't' {
					isCombined = false
					break
				}
			}
			if isCombined && len(combined) > 0 {
				for _, ch := range combined {
					switch ch {
					case 's':
						opts.Signatures = true
					case 'd':
						opts.Details = true
					case 'u':
						opts.Uses = true
					case 't':
						opts.IncludeTests = true
					}
				}
			} else {
				fmt.Fprintf(os.Stderr, "Error: unknown flag '%s'\n", arg)
				return nil, false
			}
		default:
			opts.Paths = append(opts.Paths, arg)
		}
	}

	if len(opts.Paths) == 0 {
		opts.Paths = []string{"."}
	}
	return opts, true
}

func parseBlockArgs(args []string) (*BlockOptions, bool) {
	opts := &BlockOptions{}
	var posArgs []string

	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "-h" || arg == "--help" || arg == "help":
			printUsage()
			return nil, false
		case arg == "-t" || arg == "--include-tests":
			opts.IncludeTests = true
		case arg == "--raw":
			opts.Raw = true
		case arg == "-d" || arg == "--details":
			opts.Details = true
		case strings.HasPrefix(arg, "-"):
			fmt.Fprintf(os.Stderr, "Error: unknown flag '%s'\n", arg)
			return nil, false
		default:
			posArgs = append(posArgs, arg)
		}
	}

	if len(posArgs) < 2 {
		fmt.Fprintln(os.Stderr, "Error: block requires <file> and <target>")
		fmt.Fprintln(os.Stderr, "Usage: skim-go block [options] <file> <target>")
		return nil, false
	}

	opts.File = posArgs[0]
	opts.Target = posArgs[1]
	return opts, true
}

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(0)
	}

	subcmd := os.Args[1]
	args := os.Args[2:]

	switch subcmd {
	case "glance":
		opts, ok := parseGlanceArgs(args)
		if !ok {
			os.Exit(1)
		}
		os.Exit(RunGlance(*opts))

	case "block":
		opts, ok := parseBlockArgs(args)
		if !ok {
			os.Exit(1)
		}
		os.Exit(RunBlock(*opts))

	case "-h", "--help", "help":
		printUsage()
		os.Exit(0)

	default:
		fmt.Fprintf(os.Stderr, "Error: unknown subcommand '%s'\n\n", subcmd)
		printUsage()
		os.Exit(1)
	}
}
