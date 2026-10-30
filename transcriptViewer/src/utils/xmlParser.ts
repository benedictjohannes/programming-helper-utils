import { renderMarkdown } from '../utils/markdown';

export interface XmlBlock {
  id: string;
  tagName: string;
  content: string;
  isTag: boolean;
}

export function parseXmlBlocks(text: string): XmlBlock[] {
  if (!text) return [];

  // Match tags like <TAG_NAME ...>...</TAG_NAME>
  // Case-insensitive, supporting nested/newlines
  const tagRegex = /<([A-Za-z0-9_-]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/g;
  const blocks: XmlBlock[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1];
    const innerContent = match[2];
    const matchStart = match.index;

    // Check if innerContent contains another opening tag for the same tagName.
    // E.g., "The following is a <SYSTEM_MESSAGE> ... \n\n<SYSTEM_MESSAGE>content</SYSTEM_MESSAGE>"
    // If so, the real opening tag is the innermost one.
    const nestedOpenRegex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>`, 'g');
    let nestedMatch: RegExpExecArray | null;
    let lastNestedIndex = -1;
    let lastNestedLen = 0;
    while ((nestedMatch = nestedOpenRegex.exec(innerContent)) !== null) {
      lastNestedIndex = nestedMatch.index;
      lastNestedLen = nestedMatch[0].length;
    }

    if (lastNestedIndex !== -1) {
      const realInnerContent = innerContent.slice(lastNestedIndex + lastNestedLen);
      const tagOpenEnd = match[0].indexOf('>') + 1;
      const realTagStart = matchStart + tagOpenEnd + lastNestedIndex;
      const precedingText = text.slice(lastIndex, realTagStart).trim();
      if (precedingText) {
        blocks.push({
          id: `plain-${lastIndex}`,
          tagName: 'text',
          content: precedingText,
          isTag: false,
        });
      }
      blocks.push({
        id: `tag-${realTagStart}-${tagName}`,
        tagName,
        content: realInnerContent.trim(),
        isTag: true,
      });
      lastIndex = matchStart + fullMatch.length;
      continue;
    }

    // Check if there was text preceding this tag
    if (matchStart > lastIndex) {
      const precedingText = text.slice(lastIndex, matchStart).trim();
      if (precedingText) {
        blocks.push({
          id: `plain-${lastIndex}`,
          tagName: 'text',
          content: precedingText,
          isTag: false,
        });
      }
    }

    blocks.push({
      id: `tag-${matchStart}-${tagName}`,
      tagName,
      content: innerContent.trim(),
      isTag: true,
    });

    lastIndex = matchStart + fullMatch.length;
  }

  // Trailing text
  if (lastIndex < text.length) {
    const trailingText = text.slice(lastIndex).trim();
    if (trailingText) {
      blocks.push({
        id: `plain-${lastIndex}`,
        tagName: 'text',
        content: trailingText,
        isTag: false,
      });
    }
  }

  // If no XML tags found at all, return single text block
  if (blocks.length === 0) {
    blocks.push({
      id: 'plain-0',
      tagName: 'text',
      content: text,
      isTag: false,
    });
  }

  return blocks;
}
