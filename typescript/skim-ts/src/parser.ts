import * as ts from 'typescript';
import type { OutlineItem, ParsedFile, SyntaxNotice } from './types';

export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('/__tests__/') || normalized.startsWith('__tests__/')) {
    return true;
  }
  const fileName = normalized.split('/').pop() || '';
  return /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(fileName);
}

export function getScriptKind(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function isTestCall(node: ts.Node): { isTest: boolean; testKind: string; testName: string } {
  if (!ts.isExpressionStatement(node)) {
    return { isTest: false, testKind: '', testName: '' };
  }
  if (!ts.isCallExpression(node.expression)) {
    return { isTest: false, testKind: '', testName: '' };
  }
  const call = node.expression;
  let expr = call.expression;
  const parts: string[] = [];

  while (ts.isPropertyAccessExpression(expr)) {
    parts.unshift(expr.name.text);
    expr = expr.expression;
  }
  if (ts.isIdentifier(expr)) {
    parts.unshift(expr.text);
  }

  const rootName = parts[0] || '';
  if (['describe', 'it', 'test', 'suite'].includes(rootName)) {
    let testName = '';
    const firstArg = call.arguments[0];
    if (firstArg) {
      if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
        testName = firstArg.text;
      } else {
        testName = firstArg.getText();
      }
    }
    const testKind = parts.join('.');
    return { isTest: true, testKind, testName };
  }

  return { isTest: false, testKind: '', testName: '' };
}

function getNodeLines(node: ts.Node, sf: ts.SourceFile) {
  const startPos = node.getStart(sf, false);
  const endPos = node.getEnd();
  const adjustedEndPos =
    endPos > startPos && (sf.text[endPos - 1] === '\n' || sf.text[endPos - 1] === '\r')
      ? endPos - 1
      : endPos;
  const startLine = sf.getLineAndCharacterOfPosition(startPos).line + 1;
  const endLine = sf.getLineAndCharacterOfPosition(adjustedEndPos).line + 1;
  return { startLine, endLine, startPos, endPos };
}

function extractSignatureHeader(node: ts.Node, sf: ts.SourceFile): string {
  const nodeStart = node.getStart(sf, false);

  if ('body' in node && (node as any).body) {
    const bodyStart = (node as any).body.getStart(sf, false);
    return sf.text.slice(nodeStart, bodyStart).trim().replace(/\s+/g, ' ');
  }

  const text = sf.text.slice(nodeStart, node.getEnd());
  const braceIdx = text.indexOf('{');
  const semiIdx = text.indexOf(';');
  if (braceIdx !== -1 && (semiIdx === -1 || braceIdx < semiIdx)) {
    return text.slice(0, braceIdx).trim().replace(/\s+/g, ' ');
  } else if (semiIdx !== -1) {
    return text.slice(0, semiIdx).trim().replace(/\s+/g, ' ');
  }
  const firstLine = text.split(/\r?\n/)[0] || '';
  return firstLine.trim().replace(/\s+/g, ' ');
}

function formatVariableHeader(node: ts.VariableStatement, sf: ts.SourceFile): { header: string; isFn: boolean } {
  const isExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const prefix = isExport ? 'export ' : '';
  const kw =
    node.declarationList.flags & ts.NodeFlags.Const
      ? 'const'
      : node.declarationList.flags & ts.NodeFlags.Let
      ? 'let'
      : 'var';

  const decl = node.declarationList.declarations[0];
  if (!decl) {
    return { header: `${prefix}${kw}`, isFn: false };
  }

  const name = decl.name.getText(sf);

  if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
    const init = decl.initializer;
    if (init.body) {
      const bodyStart = init.body.getStart(sf, false);
      const text = sf.text.slice(node.getStart(sf, false), bodyStart).trim().replace(/\s+/g, ' ');
      return { header: text, isFn: true };
    }
  }

  if (decl.type) {
    const typeText = decl.type.getText(sf).trim().replace(/\s+/g, ' ');
    return { header: `${prefix}${kw} ${name}: ${typeText}`, isFn: false };
  }

  if (decl.initializer) {
    const initText = decl.initializer.getText(sf).trim().replace(/\s+/g, ' ');
    if (initText.length < 35 && !initText.includes('{')) {
      return { header: `${prefix}${kw} ${name} = ${initText}`, isFn: false };
    }
  }

  return { header: `${prefix}${kw} ${name}`, isFn: false };
}

function formatTypeAliasHeader(node: ts.TypeAliasDeclaration, sf: ts.SourceFile): string {
  const isExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const prefix = isExport ? 'export type ' : 'type ';
  const name = node.name.text;
  const typeParams = node.typeParameters
    ? `<${node.typeParameters.map((p) => p.getText(sf)).join(', ')}>`
    : '';

  const typeText = node.type.getText(sf).trim().replace(/\s+/g, ' ');
  if (!typeText.includes('{') && typeText.length < 60) {
    return `${prefix}${name}${typeParams} = ${typeText}`;
  }

  return `${prefix}${name}${typeParams}`;
}

export function parseSourceFile(
  filePath: string,
  sourceText: string,
  options: { includeTests?: boolean } = {}
): ParsedFile {
  const isTest = isTestFile(filePath);
  const includeTests = Boolean(options.includeTests);

  const sf = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  );

  const items: OutlineItem[] = [];
  const testRanges: [number, number][] = [];
  const imports: string[] = [];
  const syntaxErrors: SyntaxNotice[] = [];

  const rawDiagnostics = (sf as any).parseDiagnostics || [];
  for (const diag of rawDiagnostics) {
    const { line, character } = sf.getLineAndCharacterOfPosition(diag.start ?? 0);
    const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
    syntaxErrors.push({
      line: line + 1,
      col: character + 1,
      message,
    });
  }

  const lines = sourceText.split(/\r?\n/);
  const totalLines = lines.length;

  function processTestNode(
    node: ts.Node,
    testInfo: { testKind: string; testName: string },
    parent?: OutlineItem
  ): OutlineItem {
    const { startLine, endLine, startPos, endPos } = getNodeLines(node, sf);
    const testHeader = testInfo.testName
      ? `${testInfo.testKind}("${testInfo.testName}")`
      : `${testInfo.testKind}()`;

    const item: OutlineItem = {
      kind: 'test',
      name: testInfo.testName || testInfo.testKind,
      startLine,
      endLine,
      startPos,
      endPos,
      rawHeader: `test ${testHeader}`,
      parent,
      children: [],
      fieldsOrVariants: [],
      isTest: true,
    };

    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      for (const arg of call.arguments) {
        if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
          if (arg.body && ts.isBlock(arg.body)) {
            for (const stmt of arg.body.statements) {
              const nestedTest = isTestCall(stmt);
              if (nestedTest.isTest) {
                item.children.push(processTestNode(stmt, nestedTest, item));
              }
            }
          }
        }
      }
    }

    return item;
  }

  function visit(node: ts.Node, parent?: OutlineItem) {
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;

    if (ts.isImportDeclaration(node)) {
      const impText = node.getText(sf).trim().replace(/\s+/g, ' ');
      imports.push(impText);
      return;
    }

    const testCheck = isTestCall(node);
    if (testCheck.isTest) {
      const { startLine, endLine } = getNodeLines(node, sf);
      testRanges.push([startLine, endLine]);
      if (includeTests) {
        items.push(processTestNode(node, testCheck, parent));
      }
      return;
    }

    if (ts.isClassDeclaration(node)) {
      const name = node.name?.text || 'AnonymousClass';
      const { startLine, endLine, startPos, endPos } = getNodeLines(node, sf);
      const rawHeader = extractSignatureHeader(node, sf);

      const classItem: OutlineItem = {
        kind: 'class',
        name,
        startLine,
        endLine,
        startPos,
        endPos,
        rawHeader,
        parent,
        children: [],
        fieldsOrVariants: [],
        isTest: false,
      };

      for (const member of node.members) {
        if (ts.isConstructorDeclaration(member)) {
          const mLines = getNodeLines(member, sf);
          const mHeader = extractSignatureHeader(member, sf);
          classItem.children.push({
            kind: 'method',
            name: 'constructor',
            startLine: mLines.startLine,
            endLine: mLines.endLine,
            startPos: mLines.startPos,
            endPos: mLines.endPos,
            rawHeader: mHeader.startsWith('method ') ? mHeader : `method ${mHeader}`,
            parent: classItem,
            children: [],
            fieldsOrVariants: [],
            isTest: false,
          });
        } else if (ts.isMethodDeclaration(member)) {
          const mName = member.name.getText(sf);
          const mLines = getNodeLines(member, sf);
          const mHeader = extractSignatureHeader(member, sf);
          classItem.children.push({
            kind: 'method',
            name: mName,
            startLine: mLines.startLine,
            endLine: mLines.endLine,
            startPos: mLines.startPos,
            endPos: mLines.endPos,
            rawHeader: mHeader.startsWith('method ') ? mHeader : `method ${mHeader}`,
            parent: classItem,
            children: [],
            fieldsOrVariants: [],
            isTest: false,
          });
        } else if (ts.isGetAccessorDeclaration(member)) {
          const mName = member.name.getText(sf);
          const mLines = getNodeLines(member, sf);
          const mHeader = extractSignatureHeader(member, sf);
          classItem.children.push({
            kind: 'method',
            name: mName,
            startLine: mLines.startLine,
            endLine: mLines.endLine,
            startPos: mLines.startPos,
            endPos: mLines.endPos,
            rawHeader: mHeader.startsWith('method ') ? mHeader : `method ${mHeader}`,
            parent: classItem,
            children: [],
            fieldsOrVariants: [],
            isTest: false,
          });
        } else if (ts.isSetAccessorDeclaration(member)) {
          const mName = member.name.getText(sf);
          const mLines = getNodeLines(member, sf);
          const mHeader = extractSignatureHeader(member, sf);
          classItem.children.push({
            kind: 'method',
            name: mName,
            startLine: mLines.startLine,
            endLine: mLines.endLine,
            startPos: mLines.startPos,
            endPos: mLines.endPos,
            rawHeader: mHeader.startsWith('method ') ? mHeader : `method ${mHeader}`,
            parent: classItem,
            children: [],
            fieldsOrVariants: [],
            isTest: false,
          });
        } else if (ts.isPropertyDeclaration(member)) {
          const pName = member.name.getText(sf);
          const pLines = getNodeLines(member, sf);

          // If the property is an arrow function or function expression, treat as method
          if (
            member.initializer &&
            (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))
          ) {
            const init = member.initializer;
            let mHeader = '';
            if (init.body) {
              const bodyStart = init.body.getStart(sf, false);
              mHeader = sf.text.slice(member.getStart(sf, false), bodyStart).trim().replace(/\s+/g, ' ');
            } else {
              mHeader = member.getText(sf).trim().replace(/\s+/g, ' ');
            }

            classItem.children.push({
              kind: 'method',
              name: pName,
              startLine: pLines.startLine,
              endLine: pLines.endLine,
              startPos: pLines.startPos,
              endPos: pLines.endPos,
              rawHeader: mHeader.startsWith('method ') ? mHeader : `method ${mHeader}`,
              parent: classItem,
              children: [],
              fieldsOrVariants: [],
              isTest: false,
            });
          } else {
            // Standard class field
            let pText = member.getText(sf).trim().replace(/\s+/g, ' ');
            if (pText.includes('{')) {
              pText = pText.slice(0, pText.indexOf('{')).trim();
            }
            classItem.fieldsOrVariants.push(pText);
            classItem.children.push({
              kind: 'property',
              name: pName,
              startLine: pLines.startLine,
              endLine: pLines.endLine,
              startPos: pLines.startPos,
              endPos: pLines.endPos,
              rawHeader: pText,
              parent: classItem,
              children: [],
              fieldsOrVariants: [],
              isTest: false,
            });
          }
        }
      }

      items.push(classItem);
      return;
    }

    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const { startLine, endLine, startPos, endPos } = getNodeLines(node, sf);
      const rawHeader = extractSignatureHeader(node, sf);

      const ifaceItem: OutlineItem = {
        kind: 'interface',
        name,
        startLine,
        endLine,
        startPos,
        endPos,
        rawHeader,
        parent,
        children: [],
        fieldsOrVariants: [],
        isTest: false,
      };

      for (const member of node.members) {
        const mText = member.getText(sf).trim().replace(/\s+/g, ' ');
        ifaceItem.fieldsOrVariants.push(mText);
        const mLines = getNodeLines(member, sf);
        const mName = member.name ? member.name.getText(sf) : '';
        if (mName) {
          const isMethod = ts.isMethodSignature(member);
          ifaceItem.children.push({
            kind: isMethod ? 'method' : 'property',
            name: mName,
            startLine: mLines.startLine,
            endLine: mLines.endLine,
            startPos: mLines.startPos,
            endPos: mLines.endPos,
            rawHeader: mText,
            parent: ifaceItem,
            children: [],
            fieldsOrVariants: [],
            isTest: false,
          });
        }
      }

      items.push(ifaceItem);
      return;
    }

    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      const { startLine, endLine, startPos, endPos } = getNodeLines(node, sf);
      const rawHeader = formatTypeAliasHeader(node, sf);

      const typeItem: OutlineItem = {
        kind: 'type',
        name,
        startLine,
        endLine,
        startPos,
        endPos,
        rawHeader,
        parent,
        children: [],
        fieldsOrVariants: [],
        isTest: false,
      };

      if (ts.isTypeLiteralNode(node.type)) {
        for (const member of node.type.members) {
          const mText = member.getText(sf).trim().replace(/\s+/g, ' ');
          typeItem.fieldsOrVariants.push(mText);
          const mLines = getNodeLines(member, sf);
          const mName = member.name ? member.name.getText(sf) : '';
          if (mName) {
            const isMethod = ts.isMethodSignature(member);
            typeItem.children.push({
              kind: isMethod ? 'method' : 'property',
              name: mName,
              startLine: mLines.startLine,
              endLine: mLines.endLine,
              startPos: mLines.startPos,
              endPos: mLines.endPos,
              rawHeader: mText,
              parent: typeItem,
              children: [],
              fieldsOrVariants: [],
              isTest: false,
            });
          }
        }
      }

      items.push(typeItem);
      return;
    }

    if (ts.isEnumDeclaration(node)) {
      const name = node.name.text;
      const { startLine, endLine, startPos, endPos } = getNodeLines(node, sf);
      const rawHeader = extractSignatureHeader(node, sf);

      const enumItem: OutlineItem = {
        kind: 'enum',
        name,
        startLine,
        endLine,
        startPos,
        endPos,
        rawHeader,
        parent,
        children: [],
        fieldsOrVariants: [],
        isTest: false,
      };

      for (const member of node.members) {
        const mName = member.name.getText(sf);
        const mText = member.getText(sf).trim().replace(/\s+/g, ' ');
        enumItem.fieldsOrVariants.push(mText);
        const mLines = getNodeLines(member, sf);
        enumItem.children.push({
          kind: 'variant',
          name: mName,
          startLine: mLines.startLine,
          endLine: mLines.endLine,
          startPos: mLines.startPos,
          endPos: mLines.endPos,
          rawHeader: mText,
          parent: enumItem,
          children: [],
          fieldsOrVariants: [],
          isTest: false,
        });
      }

      items.push(enumItem);
      return;
    }

    if (ts.isFunctionDeclaration(node)) {
      const name = node.name?.text || 'anonymous';
      const { startLine, endLine, startPos, endPos } = getNodeLines(node, sf);
      const rawHeader = extractSignatureHeader(node, sf);

      items.push({
        kind: 'function',
        name,
        startLine,
        endLine,
        startPos,
        endPos,
        rawHeader,
        parent,
        children: [],
        fieldsOrVariants: [],
        isTest: false,
      });
      return;
    }

    if (ts.isVariableStatement(node)) {
      const { startLine, endLine, startPos, endPos } = getNodeLines(node, sf);
      const { header, isFn } = formatVariableHeader(node, sf);

      for (const decl of node.declarationList.declarations) {
        const name = decl.name.getText(sf);
        const kind = isFn
          ? 'function'
          : node.declarationList.flags & ts.NodeFlags.Const
          ? 'const'
          : node.declarationList.flags & ts.NodeFlags.Let
          ? 'let'
          : 'var';

        items.push({
          kind,
          name,
          startLine,
          endLine,
          startPos,
          endPos,
          rawHeader: header,
          parent,
          children: [],
          fieldsOrVariants: [],
          isTest: false,
        });
      }
      return;
    }

    if (ts.isModuleDeclaration(node)) {
      const name = node.name.text;
      const { startLine, endLine, startPos, endPos } = getNodeLines(node, sf);
      const rawHeader = extractSignatureHeader(node, sf);

      const modItem: OutlineItem = {
        kind: 'namespace',
        name,
        startLine,
        endLine,
        startPos,
        endPos,
        rawHeader,
        parent,
        children: [],
        fieldsOrVariants: [],
        isTest: false,
      };

      if (node.body && ts.isModuleBlock(node.body)) {
        for (const stmt of node.body.statements) {
          visit(stmt, modItem);
        }
      }

      items.push(modItem);
      return;
    }

    ts.forEachChild(node, (child) => visit(child, parent));
  }

  for (const stmt of sf.statements) {
    visit(stmt);
  }

  return {
    filePath,
    sourceText,
    items,
    testRanges,
    imports,
    totalLines,
    isTestFile: isTest,
    syntaxErrors,
  };
}
