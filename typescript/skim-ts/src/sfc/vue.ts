import type { SfcBlock } from './types.js';

export function createLineCounter(sourceText: string): (pos: number) => number {
  const lineStarts = [0];
  for (let i = 0; i < sourceText.length; i++) {
    if (sourceText[i] === '\n') {
      lineStarts.push(i + 1);
    }
  }

  return function getLine(pos: number): number {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (lineStarts[mid]! <= pos) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return high + 1;
  };
}

export function extractVueBlocks(sourceText: string): SfcBlock[] {
  const blocks: SfcBlock[] = [];
  const len = sourceText.length;
  const getLine = createLineCounter(sourceText);
  let pos = 0;

  while (pos < len) {
    // Skip HTML comments <!-- ... -->
    if (sourceText.startsWith('<!--', pos)) {
      const commentEnd = sourceText.indexOf('-->', pos + 4);
      pos = commentEnd === -1 ? len : commentEnd + 3;
      continue;
    }

    if (sourceText[pos] === '<') {
      const sub = sourceText.slice(pos);
      const match = sub.match(/^<(script|template|style)\b([^>]*)>/i);
      if (match) {
        const tagName = match[1]!.toLowerCase();
        const fullTag = match[0]!;
        const tagStartPos = pos;
        const contentStartPos = tagStartPos + fullTag.length;
        const attrs = match[2] || '';

        if (tagName === 'template') {
          let depth = 1;
          let searchPos = contentStartPos;
          let contentEndPos = -1;
          let tagEndPos = -1;

          while (searchPos < len) {
            if (sourceText.startsWith('<!--', searchPos)) {
              const cEnd = sourceText.indexOf('-->', searchPos + 4);
              searchPos = cEnd === -1 ? len : cEnd + 3;
              continue;
            }

            if (sourceText[searchPos] === '<') {
              const rest = sourceText.slice(searchPos);
              const closeMatch = rest.match(/^<\/template\s*>/i);
              if (closeMatch) {
                depth--;
                if (depth === 0) {
                  contentEndPos = searchPos;
                  tagEndPos = searchPos + closeMatch[0].length;
                  break;
                }
                searchPos += closeMatch[0].length;
                continue;
              }

              const openMatch = rest.match(/^<template\b([^>]*)>/i);
              if (openMatch) {
                if (!openMatch[0].endsWith('/>')) {
                  depth++;
                }
                searchPos += openMatch[0].length;
                continue;
              }
            }

            searchPos++;
          }

          if (contentEndPos === -1) {
            contentEndPos = len;
            tagEndPos = len;
          }

          blocks.push({
            tag: fullTag,
            name: 'template',
            kind: 'template',
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
        } else if (tagName === 'script') {
          const closeTag = '</script>';
          const closeIdx = sourceText.toLowerCase().indexOf(closeTag, contentStartPos);
          const contentEndPos = closeIdx === -1 ? len : closeIdx;
          const tagEndPos = closeIdx === -1 ? len : closeIdx + closeTag.length;

          const isSetup = /\bsetup\b/i.test(attrs);
          const langMatch = attrs.match(/\blang=["']?([a-zA-Z0-9_-]+)["']?/i);
          const langVal = langMatch ? langMatch[1]!.toLowerCase() : 'ts';
          const lang: 'ts' | 'tsx' | 'js' = langVal === 'tsx' ? 'tsx' : langVal === 'js' ? 'js' : 'ts';

          blocks.push({
            tag: fullTag,
            name: isSetup ? 'script:setup' : 'script',
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

  return blocks;
}
