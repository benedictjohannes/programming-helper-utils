import type { SfcBlock } from './types.js';
import { createLineCounter } from './vue.js';

export function extractMarkupSegments(
  sourceText: string,
  explicitBlocks: SfcBlock[],
  getLine: (pos: number) => number
): SfcBlock[] {
  const lines = sourceText.split(/\r?\n/);
  const totalLines = lines.length;

  const isBlockLine = new Uint8Array(totalLines + 1);
  for (const block of explicitBlocks) {
    for (let l = block.startLine; l <= block.endLine; l++) {
      if (l <= totalLines) {
        isBlockLine[l] = 1;
      }
    }
  }

  // Precompute line start offsets
  const lineStartOffsets: number[] = new Array(totalLines + 1);
  let offset = 0;
  for (let l = 1; l <= totalLines; l++) {
    lineStartOffsets[l] = offset;
    offset += lines[l - 1]!.length;
    if (sourceText.startsWith('\r\n', offset)) {
      offset += 2;
    } else if (sourceText.startsWith('\n', offset)) {
      offset += 1;
    }
  }

  interface SegmentRange {
    startLine: number;
    endLine: number;
  }

  const rawSegments: SegmentRange[] = [];
  let inRun = false;
  let runStartLine = -1;
  let runEndLine = -1;

  for (let l = 1; l <= totalLines; l++) {
    if (isBlockLine[l] === 0) {
      if (!inRun) {
        inRun = true;
        runStartLine = l;
      }
      runEndLine = l;
    } else {
      if (inRun) {
        rawSegments.push({ startLine: runStartLine, endLine: runEndLine });
        inRun = false;
      }
    }
  }
  if (inRun) {
    rawSegments.push({ startLine: runStartLine, endLine: runEndLine });
  }

  // Trim leading and trailing blank lines in each segment
  const trimmedSegments: SegmentRange[] = [];
  for (const seg of rawSegments) {
    let s = seg.startLine;
    let e = seg.endLine;
    while (s <= e && (lines[s - 1]?.trim().length ?? 0) === 0) {
      s++;
    }
    while (e >= s && (lines[e - 1]?.trim().length ?? 0) === 0) {
      e--;
    }
    if (s <= e) {
      trimmedSegments.push({ startLine: s, endLine: e });
    }
  }

  if (trimmedSegments.length === 0) {
    return [];
  }

  const total = trimmedSegments.length;
  const result: SfcBlock[] = [];

  for (let i = 0; i < total; i++) {
    const seg = trimmedSegments[i]!;
    const name = total === 1 ? 'markup' : `markup:${i + 1}`;
    const tag = total === 1 ? 'markup' : `markup:${i + 1}`;

    const startPos = lineStartOffsets[seg.startLine]!;
    const lineContent = lines[seg.endLine - 1]!;
    const endPos = lineStartOffsets[seg.endLine]! + lineContent.length;

    result.push({
      tag,
      name,
      kind: 'template',
      lang: 'ts',
      startLine: seg.startLine,
      endLine: seg.endLine,
      startPos,
      endPos,
      contentStartPos: startPos,
      contentEndPos: endPos,
      isScript: false,
      hideInGlance: false,
    });
  }

  return result;
}

// Kept for backward compatibility
export function extractContiguousMarkup(
  sourceText: string,
  explicitBlocks: SfcBlock[],
  getLine: (pos: number) => number
): SfcBlock | null {
  const segments = extractMarkupSegments(sourceText, explicitBlocks, getLine);
  return segments.length > 0 ? segments[0]! : null;
}

export function extractSvelteBlocks(sourceText: string): SfcBlock[] {
  const blocks: SfcBlock[] = [];
  const len = sourceText.length;
  const getLine = createLineCounter(sourceText);
  let pos = 0;

  while (pos < len) {
    if (sourceText.startsWith('<!--', pos)) {
      const commentEnd = sourceText.indexOf('-->', pos + 4);
      pos = commentEnd === -1 ? len : commentEnd + 3;
      continue;
    }

    if (sourceText[pos] === '<') {
      const sub = sourceText.slice(pos);
      const match = sub.match(/^<(script|style)\b([^>]*)>/i);
      if (match) {
        const tagName = match[1]!.toLowerCase();
        const fullTag = match[0]!;
        const tagStartPos = pos;
        const contentStartPos = tagStartPos + fullTag.length;
        const attrs = match[2] || '';

        if (tagName === 'script') {
          const closeTag = '</script>';
          const closeIdx = sourceText.toLowerCase().indexOf(closeTag, contentStartPos);
          const contentEndPos = closeIdx === -1 ? len : closeIdx;
          const tagEndPos = closeIdx === -1 ? len : closeIdx + closeTag.length;

          const isModule =
            /\bcontext=["']?module["']?/i.test(attrs) || /\bmodule\b/i.test(attrs);
          const langMatch = attrs.match(/\blang=["']?([a-zA-Z0-9_-]+)["']?/i);
          const langVal = langMatch ? langMatch[1]!.toLowerCase() : 'ts';
          const lang: 'ts' | 'tsx' | 'js' =
            langVal === 'tsx' ? 'tsx' : langVal === 'js' ? 'js' : 'ts';

          blocks.push({
            tag: fullTag,
            name: isModule ? 'script:module' : 'script',
            kind: 'script',
            lang,
            startLine: getLine(tagStartPos),
            endLine: getLine(Math.max(tagStartPos, tagEndPos - 1)),
            startPos: tagStartPos,
            endPos: tagEndPos,
            contentStartPos,
            contentEndPos,
            isScript: true,
          });

          pos = tagEndPos;
          continue;
        } else if (tagName === 'style') {
          const closeTag = '</style>';
          const closeIdx = sourceText.toLowerCase().indexOf(closeTag, contentStartPos);
          const contentEndPos = closeIdx === -1 ? len : closeIdx;
          const tagEndPos = closeIdx === -1 ? len : closeIdx + closeTag.length;

          blocks.push({
            tag: fullTag,
            name: 'style',
            kind: 'style',
            lang: 'ts',
            startLine: getLine(tagStartPos),
            endLine: getLine(Math.max(tagStartPos, tagEndPos - 1)),
            startPos: tagStartPos,
            endPos: tagEndPos,
            contentStartPos,
            contentEndPos,
            isScript: false,
          });

          pos = tagEndPos;
          continue;
        }
      }
    }

    pos++;
  }

  const markupBlocks = extractMarkupSegments(sourceText, blocks, getLine);
  if (markupBlocks.length > 0) {
    blocks.push(...markupBlocks);
    blocks.sort((a, b) => a.startPos - b.startPos);
  }

  return blocks;
}
