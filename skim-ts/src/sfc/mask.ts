import type { SfcBlock } from './types.js';

export function maskSfc(sourceText: string, blocks: SfcBlock[]): string {
  const scriptBlocks = blocks
    .filter((b) => b.isScript)
    .sort((a, b) => a.contentStartPos - b.contentStartPos);

  const parts: string[] = [];
  let curr = 0;

  for (const block of scriptBlocks) {
    const start = Math.max(0, Math.min(block.contentStartPos, sourceText.length));
    const end = Math.max(start, Math.min(block.contentEndPos, sourceText.length));

    if (start > curr) {
      const nonScriptChunk = sourceText.slice(curr, start);
      parts.push(nonScriptChunk.replace(/[^\r\n]/g, ' '));
    }

    parts.push(sourceText.slice(start, end));
    curr = end;
  }

  if (curr < sourceText.length) {
    const trailingChunk = sourceText.slice(curr);
    parts.push(trailingChunk.replace(/[^\r\n]/g, ' '));
  }

  return parts.join('');
}
