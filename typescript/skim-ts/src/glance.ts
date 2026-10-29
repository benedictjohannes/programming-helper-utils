import * as fs from 'node:fs';
import * as path from 'node:path';
import { globSync } from 'tinyglobby';
import { parseSourceFile, isTestFile } from './parser';
import type { GlanceOptions, OutlineItem } from './types';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '.turbo',
  '.cache',
]);

const SUPPORTED_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
]);

function isSupportedFile(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  return SUPPORTED_EXTS.has(ext);
}

function findFilesRecursively(dir: string, includeTests: boolean): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (!includeTests && entry.name === '__tests__') continue;
        const subDir = path.join(dir, entry.name);
        results.push(...findFilesRecursively(subDir, includeTests));
      } else if (entry.isFile()) {
        const fullPath = path.join(dir, entry.name);
        if (isSupportedFile(fullPath)) {
          if (!includeTests && isTestFile(fullPath)) continue;
          results.push(fullPath);
        }
      }
    }
  } catch (err) {
    process.stderr.write(`Warning: error reading directory ${dir}: ${err}\n`);
  }
  return results;
}

export function collectFiles(targets: string[], includeTests: boolean): string[] {
  const files: string[] = [];

  for (const target of targets) {
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        files.push(...findFilesRecursively(target, includeTests));
      } else if (stat.isFile()) {
        if (isSupportedFile(target)) {
          if (includeTests || !isTestFile(target)) {
            files.push(target);
          }
        }
      }
    } else if (target.includes('*') || target.includes('?')) {
      try {
        const matches = globSync(target, { dot: false });
        for (const match of matches) {
          if (isSupportedFile(match)) {
            if (includeTests || !isTestFile(match)) {
              files.push(match);
            }
          }
        }
      } catch {
        // Fallback
      }
    } else {
      process.stderr.write(`Warning: path not found: ${target}\n`);
    }
  }

  const normalized = Array.from(new Set(files.map((f) => path.normalize(f))));
  normalized.sort();
  return normalized;
}

function matchItemFilters(item: OutlineItem, content: string, filters: string[]): boolean {
  if (!filters || filters.length === 0) return true;
  const blockText = content.slice(item.startPos, item.endPos).toLowerCase();
  return filters.every((f) => blockText.includes(f.toLowerCase()));
}

function hasChildMatching(item: OutlineItem, content: string, filters: string[]): boolean {
  if (!filters || filters.length === 0) return true;
  for (const ch of item.children) {
    if (matchItemFilters(ch, content, filters) || hasChildMatching(ch, content, filters)) {
      return true;
    }
  }
  return false;
}

export function runGlance(options: GlanceOptions): void {
  const includeTests = Boolean(options.includeTests);
  const files = collectFiles(options.targets, includeTests);

  if (files.length === 0) {
    process.stderr.write('Error: no TypeScript/JavaScript files found matching input.\n');
    process.exit(1);
  }

  const filters = options.filter || [];
  let printedCount = 0;

  files.forEach((filePath) => {
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      process.stderr.write(`Error reading ${filePath}: ${err}\n`);
      return;
    }

    const parsed = parseSourceFile(filePath, content, { includeTests });

    if (filters.length > 0) {
      const hasMatch = parsed.items.some(
        (it) => matchItemFilters(it, content, filters) || hasChildMatching(it, content, filters)
      );
      if (!hasMatch && parsed.syntaxErrors.length === 0) {
        return;
      }
    }

    if (printedCount > 0) {
      console.log('\n' + '='.repeat(70) + '\n');
    }
    printedCount++;

    let testInfo = '';
    if (parsed.isTestFile && includeTests) {
      testInfo = ' [test]';
    } else if (parsed.testRanges.length > 0 && !includeTests) {
      const trDesc = parsed.testRanges.map(([s, e]) => `${s}..${e}`).join(', ');
      testInfo = ` [tests skipped: ${trDesc}]`;
    }

    let errorTag = '';
    if (parsed.syntaxErrors.length > 0) {
      const n = parsed.syntaxErrors.length;
      errorTag = n === 1 ? ' [! 1 syntax error]' : ` [! ${n} syntax errors]`;
    }

    const relPath = path.relative(process.cwd(), filePath) || filePath;
    console.log(`=== ${relPath} (${parsed.totalLines} lines)${testInfo}${errorTag} ===`);

    for (const err of parsed.syntaxErrors) {
      console.log(`  Syntax Notice: L${err.line}: ${err.message}`);
    }

    if (options.uses) {
      if (parsed.imports.length > 0) {
        console.log('\nImports:');
        for (const imp of parsed.imports) {
          console.log(`  ${imp}`);
        }
      } else {
        console.log('\nImports: (none)');
      }
    }

    console.log('\nOutline:');

    function renderTree(items: OutlineItem[], depth: number = 0) {
      for (const it of items) {
        const matches = matchItemFilters(it, content, filters);
        const childMatches = hasChildMatching(it, content, filters);

        if (!matches && !childMatches) {
          continue;
        }

        const span = `L${it.startLine}-L${it.endLine}`;
        let label = '';
        if (it.kind === 'test') {
          label = it.rawHeader;
        } else if (options.signatures) {
          label = it.rawHeader;
        } else {
          label = `${it.kind} ${it.name}`;
        }

        const childIndent = '  '.repeat(depth);
        console.log(`  ${span.padEnd(12, ' ')} ${childIndent}${label}`);

        if (it.fieldsOrVariants.length > 0 && options.details) {
          const fIndent = ' '.repeat(17 + depth * 2);
          for (const fv of it.fieldsOrVariants) {
            console.log(`${fIndent}| ${fv}`);
          }
        }

        const outlineChildren = it.children.filter(
          (ch) => ch.kind === 'method' || ch.kind === 'test'
        );
        if (outlineChildren.length > 0) {
          renderTree(outlineChildren, depth + 1);
        }
      }
    }

    renderTree(parsed.items, 0);
  });
}
