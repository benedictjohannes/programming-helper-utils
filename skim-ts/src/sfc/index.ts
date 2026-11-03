import type { OutlineItem, ParsedFile } from '../types.js';
import { parseSourceFile, isTestFile } from '../parser.js';
import type { SfcBlock } from './types.js';
import { maskSfc } from './mask.js';
import { extractVueBlocks } from './vue.js';
import { extractSvelteBlocks } from './svelte.js';
import { extractAstroBlocks } from './astro.js';

export * from './types.js';
export * from './mask.js';
export * from './vue.js';
export * from './svelte.js';
export * from './astro.js';

export function isSfcFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() || '';
  return /\.(vue|svelte|astro)$/i.test(fileName);
}

export function extractSfcBlocks(filePath: string, sourceText: string): SfcBlock[] {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() || '';
  if (/\.vue$/i.test(fileName)) {
    return extractVueBlocks(sourceText);
  }
  if (/\.svelte$/i.test(fileName)) {
    return extractSvelteBlocks(sourceText);
  }
  if (/\.astro$/i.test(fileName)) {
    return extractAstroBlocks(sourceText);
  }
  return [];
}

export function parseSfcFile(
  filePath: string,
  sourceText: string,
  options: { includeTests?: boolean } = {}
): ParsedFile {
  const blocks = extractSfcBlocks(filePath, sourceText);
  const maskedText = maskSfc(sourceText, blocks);

  // Virtual file with .tsx extension so TS compiler parses TS, JS, and TSX/JSX constructs
  const virtualPath = `${filePath}.tsx`;
  const parsed = parseSourceFile(virtualPath, maskedText, options);

  const sfcItems: OutlineItem[] = [];

  for (const block of blocks) {
    const sfcItem: OutlineItem = {
      kind: block.kind,
      name: block.name,
      startLine: block.startLine,
      endLine: block.endLine,
      startPos: block.startPos,
      endPos: block.endPos,
      rawHeader: block.tag,
      children: [],
      fieldsOrVariants: [],
      isTest: false,
      isSfcBlock: true,
      hideInGlance: block.hideInGlance,
    };

    if (block.isScript) {
      for (const child of parsed.items) {
        if (child.startLine >= block.startLine && child.endLine <= block.endLine) {
          child.parent = sfcItem;
          sfcItem.children.push(child);
        }
      }
    }

    sfcItems.push(sfcItem);
  }

  // Filter diagnostics to only those within script blocks
  const syntaxErrors = parsed.syntaxErrors.filter((err) =>
    blocks.some(
      (b) => b.isScript && err.line >= b.startLine && err.line <= b.endLine
    )
  );

  const lines = sourceText.split(/\r?\n/);

  return {
    filePath,
    sourceText,
    items: sfcItems,
    testRanges: parsed.testRanges,
    imports: parsed.imports,
    totalLines: lines.length,
    isTestFile: isTestFile(filePath),
    syntaxErrors,
  };
}
