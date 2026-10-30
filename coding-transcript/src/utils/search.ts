import type { TimelineItem, SearchMatch } from '../types';

export interface FilterOptions {
  userInput: boolean;
  modelResponse: boolean;
  toolInput: boolean;
  toolOutput: boolean;
  systemMessage: boolean;
}

export function searchTimeline(
  timeline: TimelineItem[],
  query: string,
  filters: FilterOptions
): SearchMatch[] {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const matches: SearchMatch[] = [];

  let matchIndex = 0;

  for (const item of timeline) {
    if (item.type === 'user_input' && filters.userInput) {
      if (item.content && item.content.toLowerCase().includes(q)) {
        matches.push({
          itemId: item.id,
          field: 'user_prompt',
          preview: extractSnippet(item.content, q),
          matchIndex: matchIndex++,
        });
      }
    } else if (item.type === 'model_response' && filters.modelResponse) {
      if (item.content && item.content.toLowerCase().includes(q)) {
        matches.push({
          itemId: item.id,
          field: 'assistant_text',
          preview: extractSnippet(item.content, q),
          matchIndex: matchIndex++,
        });
      }
      if (item.thinking && item.thinking.toLowerCase().includes(q)) {
        matches.push({
          itemId: item.id,
          field: 'assistant_text',
          preview: extractSnippet(item.thinking, q),
          matchIndex: matchIndex++,
        });
      }
    } else if (item.type === 'tool_executions' && (filters.toolInput || filters.toolOutput)) {
      if (item.tools) {
        for (const tool of item.tools) {
          // Check tool input args
          if (filters.toolInput) {
            const argsStr = JSON.stringify(tool.args || {});
            if (argsStr.toLowerCase().includes(q) || tool.name.toLowerCase().includes(q)) {
              matches.push({
                itemId: item.id,
                subId: tool.id,
                field: 'tool_input',
                preview: `${tool.name}: ${extractSnippet(argsStr, q)}`,
                matchIndex: matchIndex++,
              });
            }
            if (tool.thinking && tool.thinking.toLowerCase().includes(q)) {
              matches.push({
                itemId: item.id,
                subId: tool.id,
                field: 'tool_input',
                preview: `${tool.name} thought: ${extractSnippet(tool.thinking, q)}`,
                matchIndex: matchIndex++,
              });
            }
          }
          // Check tool output
          if (filters.toolOutput && tool.outputContent) {
            if (tool.outputContent.toLowerCase().includes(q)) {
              matches.push({
                itemId: item.id,
                subId: tool.id,
                field: 'tool_output',
                preview: `${tool.name} output: ${extractSnippet(tool.outputContent, q)}`,
                matchIndex: matchIndex++,
              });
            }
          }
        }
      }
    } else if (item.type === 'system_message' && filters.systemMessage) {
      if (item.content && item.content.toLowerCase().includes(q)) {
        matches.push({
          itemId: item.id,
          field: 'system',
          preview: extractSnippet(item.content, q),
          matchIndex: matchIndex++,
        });
      }
    }
  }

  return matches;
}

function extractSnippet(text: string, query: string, contextLen = 40): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 80);

  const start = Math.max(0, idx - contextLen);
  const end = Math.min(text.length, idx + query.length + contextLen);
  let snippet = text.slice(start, end).replace(/\n/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}
