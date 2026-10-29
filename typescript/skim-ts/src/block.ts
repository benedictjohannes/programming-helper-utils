import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSourceFile } from './parser';
import { getQualifiedName, type BlockOptions, type OutlineItem } from './types';

function collectAllItems(items: OutlineItem[]): OutlineItem[] {
  const res: OutlineItem[] = [];
  for (const it of items) {
    res.push(it);
    if (it.children.length > 0) {
      res.push(...collectAllItems(it.children));
    }
  }
  return res;
}

export function runBlock(options: BlockOptions): void {
  const filePath = options.file;
  const target = options.target;

  if (!fs.existsSync(filePath)) {
    process.stderr.write(`Error: file not found: ${filePath}\n`);
    process.exit(1);
  }

  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    process.stderr.write(`Error reading ${filePath}: ${err}\n`);
    process.exit(1);
  }

  const parsed = parseSourceFile(filePath, content, {
    includeTests: Boolean(options.includeTests),
  });
  const allItems = collectAllItems(parsed.items);

  let matches: OutlineItem[] = [];

  if (target.includes('.')) {
    const dotIdx = target.indexOf('.');
    const parentTarget = target.slice(0, dotIdx);
    const childTarget = target.slice(dotIdx + 1);

    const parentCandidates = allItems.filter((it) => it.parent !== undefined);

    // Tier 1: Exact case match on both parent and child
    const exactMatches = parentCandidates.filter(
      (it) => it.parent!.name === parentTarget && it.name === childTarget
    );

    if (exactMatches.length > 0) {
      matches = exactMatches;
    } else {
      // Tier 2: Case-insensitive match on both parent and child
      const pLower = parentTarget.toLowerCase();
      const cLower = childTarget.toLowerCase();
      const caseMatches = parentCandidates.filter(
        (it) => it.parent!.name.toLowerCase() === pLower && it.name.toLowerCase() === cLower
      );

      if (caseMatches.length > 0) {
        matches = caseMatches;
      } else {
        // Tier 3: Substring search
        matches = parentCandidates.filter(
          (it) =>
            it.parent!.name.toLowerCase().includes(pLower) &&
            (it.name.toLowerCase().includes(cLower) || it.rawHeader.toLowerCase().includes(cLower))
        );
      }
    }
  } else {
    // Standalone identifier
    // Tier 1: Exact match on name
    const exactMatches = allItems.filter((it) => it.name === target);

    if (exactMatches.length > 0) {
      matches = exactMatches;
    } else {
      // Tier 2: Case-insensitive match on name
      const targetLower = target.toLowerCase();
      const caseMatches = allItems.filter((it) => it.name.toLowerCase() === targetLower);

      if (caseMatches.length > 0) {
        matches = caseMatches;
      } else {
        // Tier 3: Case-insensitive substring match
        matches = allItems.filter(
          (it) =>
            it.name.toLowerCase().includes(targetLower) ||
            it.rawHeader.toLowerCase().includes(targetLower)
        );
      }
    }
  }

  const relPath = path.relative(process.cwd(), filePath) || filePath;

  if (matches.length === 0) {
    process.stderr.write(`Error: block '${target}' not found in ${relPath}\n`);
    process.exit(2);
  }

  if (matches.length > 1) {
    process.stderr.write(
      `Error: ambiguous target '${target}' matched ${matches.length} candidates in ${relPath}:\n`
    );
    matches.forEach((m, idx) => {
      const span = `L${m.startLine}-L${m.endLine}`;
      const qName = getQualifiedName(m);
      process.stderr.write(`  ${idx + 1}) ${span.padEnd(10, ' ')} ${m.kind} ${qName}\n`);
    });
    process.stderr.write(
      '\nTip: Disambiguate with Class.method (e.g. UserService.getUser) or read line range directly.\n'
    );
    process.exit(3);
  }

  const chosen = matches[0];
  if (!chosen) {
    process.exit(2);
  }
  const srcLines = content.split(/\r?\n/);
  const blockLines = srcLines.slice(chosen.startLine - 1, chosen.endLine);

  // Check for syntax errors within block range
  const blockErrors = parsed.syntaxErrors.filter(
    (e) => e.line >= chosen.startLine && e.line <= chosen.endLine
  );

  let errorTag = '';
  if (blockErrors.length > 0) {
    const n = blockErrors.length;
    errorTag = n === 1 ? ' [! 1 syntax error]' : ` [! ${n} syntax errors]`;
  }

  if (options.raw) {
    console.log(blockLines.join('\n'));
  } else {
    console.log(`=== ${relPath} (L${chosen.startLine}-L${chosen.endLine})${errorTag} ===`);
    for (const err of blockErrors) {
      console.log(`  Syntax Notice: L${err.line}: ${err.message}`);
    }
    blockLines.forEach((line, idx) => {
      const lineNum = chosen.startLine + idx;
      console.log(`${String(lineNum).padStart(5, ' ')} | ${line}`);
    });
  }
}
