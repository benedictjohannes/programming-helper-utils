import type { SfcBlock } from './types.js';
import { createLineCounter } from './vue.js';
import { extractMarkupSegments } from './svelte.js';

export function extractAstroBlocks(sourceText: string): SfcBlock[] {
  const blocks: SfcBlock[] = [];
  const len = sourceText.length;
  const getLine = createLineCounter(sourceText);
  let pos = 0;

  // 1. Astro frontmatter
  const fmStartMatch = sourceText.match(/^\s*---\s*(?:\r?\n)/);
  if (fmStartMatch) {
    const fmStartPos = sourceText.indexOf('---');
    const contentStartPos = fmStartMatch[0].length;
    const rest = sourceText.slice(contentStartPos);
    const fmEndMatch = rest.match(/(?:^|\n)---\s*(?:\r?\n|$)/);

    if (fmEndMatch && fmEndMatch.index !== undefined) {
      const newlineOffset = fmEndMatch[0].startsWith('\n') ? 1 : 0;
      const contentEndPos = contentStartPos + fmEndMatch.index + newlineOffset;
      const fmEndPos = contentStartPos + fmEndMatch.index + fmEndMatch[0].length;
      const trailingNewlineLen = fmEndMatch[0].endsWith('\r\n')
        ? 2
        : fmEndMatch[0].endsWith('\n')
        ? 1
        : 0;
      const tagEndPos = fmEndPos - trailingNewlineLen;

      blocks.push({
        tag: '---',
        name: 'frontmatter',
        kind: 'frontmatter',
        lang: 'ts',
        startLine: getLine(fmStartPos),
        endLine: getLine(Math.max(fmStartPos, tagEndPos - 1)),
        startPos: fmStartPos,
        endPos: tagEndPos,
        contentStartPos,
        contentEndPos,
        isScript: true,
      });

      pos = fmEndPos;
    }
  }

  // 2. Client scripts and styles
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

          const langMatch = attrs.match(/\blang=["']?([a-zA-Z0-9_-]+)["']?/i);
          const langVal = langMatch ? langMatch[1]!.toLowerCase() : 'ts';
          const lang: 'ts' | 'tsx' | 'js' =
            langVal === 'tsx' ? 'tsx' : langVal === 'js' ? 'js' : 'ts';

          blocks.push({
            tag: fullTag,
            name: 'script',
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
