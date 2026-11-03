package main

import (
	"bytes"
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/scanner"
	"go/token"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

var (
	spaceRe         = regexp.MustCompile(`\s+`)
	trailingCommaRe = regexp.MustCompile(`,\s*\)`)
	openParenRe     = regexp.MustCompile(`\(\s+`)
	closeParenRe    = regexp.MustCompile(`\s+\)`)
)

type ItemKind string

const (
	KindFunc   ItemKind = "func"
	KindMethod ItemKind = "method"
	KindType   ItemKind = "type"
	KindConst  ItemKind = "const"
	KindVar    ItemKind = "var"
)

type Item struct {
	Kind          ItemKind
	Name          string
	ReceiverType  string
	QualifiedName string
	StartLine     int
	EndLine       int
	Header        string
	Signature     string
	Details       []string
	IsTest        bool
	BlockText     string
}

type SyntaxNotice struct {
	Line    int
	Col     int
	Message string
}

type ParsedFile struct {
	FilePath     string
	RelPath      string
	Content      string
	Lines        []string
	TotalLines   int
	Imports      []string
	Items        []Item
	IsTest       bool
	SyntaxErrors []SyntaxNotice
}

func isTestFile(path string) bool {
	base := filepath.Base(path)
	return strings.HasSuffix(base, "_test.go")
}

func isTestIdentifier(prefix, name string) bool {
	if !strings.HasPrefix(name, prefix) {
		return false
	}
	if len(name) == len(prefix) {
		return true
	}
	r, _ := utf8.DecodeRuneInString(name[len(prefix):])
	return !unicode.IsLower(r)
}

func isTestFunction(name string) bool {
	return isTestIdentifier("Test", name) ||
		isTestIdentifier("Benchmark", name) ||
		isTestIdentifier("Example", name) ||
		isTestIdentifier("Fuzz", name)
}

func extractReceiverBaseType(recv *ast.FieldList) string {
	if recv == nil || len(recv.List) == 0 {
		return ""
	}
	t := recv.List[0].Type
	for {
		switch expr := t.(type) {
		case *ast.StarExpr:
			t = expr.X
		case *ast.ParenExpr:
			t = expr.X
		case *ast.IndexExpr:
			t = expr.X
		case *ast.IndexListExpr:
			t = expr.X
		case *ast.Ident:
			return expr.Name
		default:
			return ""
		}
	}
}

func formatExpr(fset *token.FileSet, node any) string {
	if node == nil {
		return ""
	}
	var buf bytes.Buffer
	if err := printer.Fprint(&buf, fset, node); err != nil {
		return ""
	}
	s := buf.String()
	s = spaceRe.ReplaceAllString(s, " ")
	s = trailingCommaRe.ReplaceAllString(s, ")")
	s = openParenRe.ReplaceAllString(s, "(")
	s = closeParenRe.ReplaceAllString(s, ")")
	return strings.TrimSpace(s)
}

func cleanFuncSignature(fset *token.FileSet, fn *ast.FuncDecl) string {
	clone := *fn
	clone.Body = nil
	clone.Doc = nil
	var buf bytes.Buffer
	if err := printer.Fprint(&buf, fset, &clone); err != nil {
		return fn.Name.Name
	}
	sig := buf.String()
	sig = spaceRe.ReplaceAllString(sig, " ")
	sig = trailingCommaRe.ReplaceAllString(sig, ")")
	sig = openParenRe.ReplaceAllString(sig, "(")
	sig = closeParenRe.ReplaceAllString(sig, ")")
	return strings.TrimSpace(sig)
}

func formatReceiver(fset *token.FileSet, recv *ast.FieldList) string {
	if recv == nil || len(recv.List) == 0 {
		return ""
	}
	fld := recv.List[0]
	typeStr := formatExpr(fset, fld.Type)
	if len(fld.Names) > 0 {
		return fmt.Sprintf("(%s %s)", fld.Names[0].Name, typeStr)
	}
	return fmt.Sprintf("(%s)", typeStr)
}

func splitLines(content string) []string {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")
	lines := strings.Split(content, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

func getBlockText(lines []string, startLine, endLine int) string {
	if startLine < 1 {
		startLine = 1
	}
	if endLine > len(lines) {
		endLine = len(lines)
	}
	if startLine > endLine || startLine > len(lines) {
		return ""
	}
	return strings.Join(lines[startLine-1:endLine], "\n")
}

func ParseGoSource(filePath string, relPath string, content string) (*ParsedFile, error) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, filePath, content, parser.ParseComments)
	var syntaxErrors []SyntaxNotice
	if err != nil {
		var errList scanner.ErrorList
		if errors.As(err, &errList) {
			for _, e := range errList {
				syntaxErrors = append(syntaxErrors, SyntaxNotice{
					Line:    e.Pos.Line,
					Col:     e.Pos.Column,
					Message: e.Msg,
				})
			}
		} else {
			var singleErr *scanner.Error
			if errors.As(err, &singleErr) {
				syntaxErrors = append(syntaxErrors, SyntaxNotice{
					Line:    singleErr.Pos.Line,
					Col:     singleErr.Pos.Column,
					Message: singleErr.Msg,
				})
			} else {
				// If parsing completely failed with no AST returned
				if f == nil {
					return nil, err
				}
				syntaxErrors = append(syntaxErrors, SyntaxNotice{
					Line:    1,
					Col:     1,
					Message: err.Error(),
				})
			}
		}
	}

	if f == nil {
		return nil, err
	}

	lines := splitLines(content)
	totalLines := len(lines)
	testFile := isTestFile(filePath)

	var imports []string
	for _, imp := range f.Imports {
		if imp.Name != nil {
			imports = append(imports, fmt.Sprintf("import %s %s", imp.Name.Name, imp.Path.Value))
		} else {
			imports = append(imports, fmt.Sprintf("import %s", imp.Path.Value))
		}
	}

	var items []Item

	for _, decl := range f.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			isMethod := d.Recv != nil && len(d.Recv.List) > 0
			startLine := fset.Position(d.Pos()).Line
			endLine := fset.Position(d.End()).Line
			sig := cleanFuncSignature(fset, d)
			blockText := getBlockText(lines, startLine, endLine)

			if isMethod {
				recvBase := extractReceiverBaseType(d.Recv)
				recvStr := formatReceiver(fset, d.Recv)
				header := fmt.Sprintf("func %s %s", recvStr, d.Name.Name)
				items = append(items, Item{
					Kind:          KindMethod,
					Name:          d.Name.Name,
					ReceiverType:  recvBase,
					QualifiedName: fmt.Sprintf("%s.%s", recvBase, d.Name.Name),
					StartLine:     startLine,
					EndLine:       endLine,
					Header:        header,
					Signature:     sig,
					IsTest:        false,
					BlockText:     blockText,
				})
			} else {
				isTest := isTestFunction(d.Name.Name)
				header := fmt.Sprintf("func %s", d.Name.Name)
				items = append(items, Item{
					Kind:          KindFunc,
					Name:          d.Name.Name,
					QualifiedName: d.Name.Name,
					StartLine:     startLine,
					EndLine:       endLine,
					Header:        header,
					Signature:     sig,
					IsTest:        isTest,
					BlockText:     blockText,
				})
			}

		case *ast.GenDecl:
			switch d.Tok {
			case token.TYPE:
				isGrouped := d.Lparen != token.NoPos
				for _, spec := range d.Specs {
					ts, ok := spec.(*ast.TypeSpec)
					if !ok {
						continue
					}
					var startLine, endLine int
					if isGrouped {
						startLine = fset.Position(ts.Pos()).Line
						endLine = fset.Position(ts.End()).Line
					} else {
						startLine = fset.Position(d.Pos()).Line
						endLine = fset.Position(d.End()).Line
					}
					blockText := getBlockText(lines, startLine, endLine)

					typeNameWithParams := ts.Name.Name
					if ts.TypeParams != nil && len(ts.TypeParams.List) > 0 {
						typeNameWithParams += formatExpr(fset, ts.TypeParams)
					}

					header := fmt.Sprintf("type %s", ts.Name.Name)
					var sig string
					var details []string

					switch t := ts.Type.(type) {
					case *ast.StructType:
						sig = fmt.Sprintf("type %s struct", typeNameWithParams)
						if t.Fields != nil {
							for _, fld := range t.Fields.List {
								typeStr := formatExpr(fset, fld.Type)
								tagStr := ""
								if fld.Tag != nil {
									tagStr = " " + fld.Tag.Value
								}
								if len(fld.Names) > 0 {
									names := make([]string, len(fld.Names))
									for i, n := range fld.Names {
										names[i] = n.Name
									}
									details = append(details, fmt.Sprintf("%s %s%s", strings.Join(names, ", "), typeStr, tagStr))
								} else {
									details = append(details, fmt.Sprintf("%s%s", typeStr, tagStr))
								}
							}
						}

					case *ast.InterfaceType:
						sig = fmt.Sprintf("type %s interface", typeNameWithParams)
						if t.Methods != nil {
							for _, m := range t.Methods.List {
								if len(m.Names) > 0 {
									methodName := m.Names[0].Name
									methodSig := formatExpr(fset, m.Type)
									methodSig = strings.TrimPrefix(methodSig, "func")
									details = append(details, fmt.Sprintf("%s%s", methodName, methodSig))
								} else {
									details = append(details, formatExpr(fset, m.Type))
								}
							}
						}

					default:
						assignStr := " "
						if ts.Assign != token.NoPos {
							assignStr = " = "
						}
						typeStr := formatExpr(fset, ts.Type)
						sig = fmt.Sprintf("type %s%s%s", typeNameWithParams, assignStr, typeStr)
					}

					items = append(items, Item{
						Kind:          KindType,
						Name:          ts.Name.Name,
						QualifiedName: ts.Name.Name,
						StartLine:     startLine,
						EndLine:       endLine,
						Header:        header,
						Signature:     sig,
						Details:       details,
						IsTest:        false,
						BlockText:     blockText,
					})
				}

			case token.CONST, token.VAR:
				kind := KindConst
				kw := "const"
				if d.Tok == token.VAR {
					kind = KindVar
					kw = "var"
				}

				isGrouped := d.Lparen != token.NoPos
				for _, spec := range d.Specs {
					vs, ok := spec.(*ast.ValueSpec)
					if !ok {
						continue
					}

					for idx, nameIdent := range vs.Names {
						var startLine, endLine int
						if isGrouped || len(vs.Names) > 1 {
							startLine = fset.Position(nameIdent.Pos()).Line
							endLine = fset.Position(nameIdent.End()).Line
							if len(vs.Values) > idx {
								endLine = fset.Position(vs.Values[idx].End()).Line
							} else if vs.Type != nil {
								endLine = fset.Position(vs.Type.End()).Line
							}
						} else {
							startLine = fset.Position(d.Pos()).Line
							endLine = fset.Position(d.End()).Line
						}
						blockText := getBlockText(lines, startLine, endLine)

						header := fmt.Sprintf("%s %s", kw, nameIdent.Name)

						var sig string
						typeStr := ""
						if vs.Type != nil {
							typeStr = formatExpr(fset, vs.Type)
						}

						if len(vs.Values) > idx {
							valStr := formatExpr(fset, vs.Values[idx])
							if typeStr != "" {
								sig = fmt.Sprintf("%s %s %s = %s", kw, nameIdent.Name, typeStr, valStr)
							} else {
								sig = fmt.Sprintf("%s %s = %s", kw, nameIdent.Name, valStr)
							}
						} else if typeStr != "" {
							sig = fmt.Sprintf("%s %s %s", kw, nameIdent.Name, typeStr)
						} else {
							sig = fmt.Sprintf("%s %s", kw, nameIdent.Name)
						}

						items = append(items, Item{
							Kind:          kind,
							Name:          nameIdent.Name,
							QualifiedName: nameIdent.Name,
							StartLine:     startLine,
							EndLine:       endLine,
							Header:        header,
							Signature:     sig,
							IsTest:        false,
							BlockText:     blockText,
						})
					}
				}
			}
		}
	}

	return &ParsedFile{
		FilePath:     filePath,
		RelPath:      relPath,
		Content:      content,
		Lines:        lines,
		TotalLines:   totalLines,
		Imports:      imports,
		Items:        items,
		IsTest:       testFile,
		SyntaxErrors: syntaxErrors,
	}, nil
}
