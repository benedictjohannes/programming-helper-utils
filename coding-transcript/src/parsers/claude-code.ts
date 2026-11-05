import type { TimelineItem, ToolCallItem, ModelInfo, FileOperationInfo } from '../types';
import type { PlatformParser, ParseResult } from './types';

export const claudeCodeParser: PlatformParser = {
  id: 'claude_code',
  name: 'Claude Code',
  dotColor: 'bg-orange-500',
  badgeClass: 'border-orange-500/30 text-orange-400',
  detect(rawText: string, sampleRecords: any[]): boolean {
    if (!sampleRecords || sampleRecords.length === 0) return false;
    for (const rec of sampleRecords) {
      if (!rec || typeof rec !== 'object') continue;

      // 1. Core Claude Code session records signature
      if ('sessionId' in rec) {
        if (
          'permissionMode' in rec ||
          'parentUuid' in rec ||
          'isSidechain' in rec ||
          'accountUuid' in rec ||
          'promptId' in rec ||
          'turnOrigin' in rec ||
          'userType' in rec ||
          'promptSource' in rec ||
          ['mode', 'permission-mode', 'session-owner', 'bridge-session', 'queue-operation', 'cost-state', 'last-prompt', 'file-history-snapshot'].includes(rec.type)
        ) {
          return true;
        }
      }

      // 2. Event graph records with parentUuid and uuid
      if (
        'parentUuid' in rec &&
        'uuid' in rec &&
        ['user', 'assistant', 'system', 'attachment'].includes(rec.type)
      ) {
        return true;
      }

      // 3. Distinct standalone Claude Code events
      if (rec.type === 'cost-state' || rec.type === 'permission-mode' || rec.type === 'bridge-session') {
        return true;
      }
    }
    return false;
  },

  parse(rawText: string): ParseResult {
    let records: any[] = [];
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        records = parsed;
      } else if (parsed && typeof parsed === 'object') {
        records = [parsed];
      }
    } catch {
      const lines = rawText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          records.push(JSON.parse(trimmed));
        } catch {}
      }
    }

    // 1. Index tool results: tool_use_id -> { content: string, isError: boolean }
    const toolResults = new Map<string, { content: string; isError: boolean }>();
    // Index user attachments: userUuid -> array of attached file paths
    const userAttachedFiles = new Map<string, string[]>();
    let costStateRecord: any = null;

    for (const r of records) {
      if (!r || typeof r !== 'object') continue;

      if (r.type === 'user') {
        const msg = r.message || r;
        if (Array.isArray(msg.content)) {
          for (const b of msg.content) {
            if (b && typeof b === 'object' && b.type === 'tool_result') {
              const toolUseId = b.tool_use_id;
              if (toolUseId) {
                toolResults.set(toolUseId, {
                  content: extractToolOutput(b.content),
                  isError: b.is_error === true,
                });
              }
            }
          }
        }
      } else if (r.type === 'attachment') {
        const parentUuid = r.parentUuid;
        const att = r.attachment;
        if (parentUuid && att) {
          const filePath = att.filename || att.displayPath;
          if (filePath && (att.type === 'file' || att.type === 'edited_text_file')) {
            const list = userAttachedFiles.get(parentUuid) || [];
            list.push(filePath);
            userAttachedFiles.set(parentUuid, list);
          }
        }
      } else if (r.type === 'cost-state') {
        costStateRecord = r;
      }
    }

    const timeline: TimelineItem[] = [];
    let step = 0;
    let totalTokens = 0;

    let i = 0;
    while (i < records.length) {
      const r = records[i];
      if (!r || typeof r !== 'object') {
        i++;
        continue;
      }

      const t = r.type;

      // --- USER PROMPT ---
      if (t === 'user') {
        const msg = r.message || r;
        const contentRaw = msg.content;

        // If string: it is a real human prompt
        if (typeof contentRaw === 'string') {
          const createdAt = formatTimestamp(r.timestamp || r.created_at);
          const attachedFiles = userAttachedFiles.get(r.uuid) || [];
          const media = attachedFiles.map((fn) => ({
            mime_type: 'file',
            uri: fn,
          }));

          timeline.push({
            id: r.uuid ? `claude-user-${r.uuid}` : `claude-user-${step}`,
            type: 'user_input',
            stepIndex: step++,
            createdAt,
            content: contentRaw,
            media: media.length > 0 ? media : undefined,
          });
        }
        // If contentRaw is array (tool_result), handled via toolResultMap
        i++;
        continue;
      }

      // --- ASSISTANT RESPONSE (Merged by contiguous requestId) ---
      if (t === 'assistant') {
        const reqId = r.requestId;
        const group: any[] = [];

        while (
          i < records.length &&
          records[i]?.type === 'assistant' &&
          (reqId ? records[i]?.requestId === reqId : true)
        ) {
          group.push(records[i]);
          i++;
          // If no reqId, do not group arbitrarily across multiple records
          if (!reqId) break;
        }

        const texts: string[] = [];
        const toolUseBlocks: any[] = [];
        let thinkingText: string | undefined;
        let maxThinkingDurationMs = 0;
        let usage: any = null;
        let modelName: string | undefined;
        let effort: string | undefined;

        for (const chunk of group) {
          const chunkMsg = chunk.message || chunk;
          if (chunk.thinkingDurationMs) {
            maxThinkingDurationMs = Math.max(maxThinkingDurationMs, chunk.thinkingDurationMs);
          }
          if (!modelName) {
            modelName = chunk.requestedModel || chunkMsg.model;
          }
          if (!effort && chunk.effort) {
            effort = chunk.effort;
          }
          if (!usage && chunkMsg.usage) {
            usage = chunkMsg.usage;
          }

          const content = Array.isArray(chunkMsg.content) ? chunkMsg.content : [];
          for (const block of content) {
            if (!block || typeof block !== 'object') continue;
            if (block.type === 'text' && typeof block.text === 'string') {
              if (block.text.trim()) {
                texts.push(block.text);
              }
            } else if (block.type === 'tool_use') {
              toolUseBlocks.push(block);
            } else if (block.type === 'thinking') {
              if (block.thinking && typeof block.thinking === 'string' && block.thinking.trim()) {
                thinkingText = block.thinking.trim();
              }
            }
          }
        }

        // If thinking text is empty/redacted but duration exists, note duration
        if (!thinkingText && maxThinkingDurationMs > 0) {
          thinkingText = `*Thinking process completed in ${(maxThinkingDurationMs / 1000).toFixed(1)}s*`;
        }

        let modelInfo: ModelInfo | undefined;
        if (modelName) {
          modelInfo = {
            model: modelName,
            variant: effort ? `effort: ${effort}` : undefined,
            provider: 'anthropic',
          };
        }

        const itemTokens = usage
          ? {
              input: usage.input_tokens,
              output: usage.output_tokens,
              cacheRead: usage.cache_read_input_tokens,
            }
          : undefined;

        const firstChunk = group[0];
        const createdAt = formatTimestamp(firstChunk.timestamp || firstChunk.created_at);

        // Emit text response turn if present
        if (texts.length > 0) {
          timeline.push({
            id: firstChunk.uuid ? `claude-model-${firstChunk.uuid}` : `claude-model-${step}`,
            type: 'model_response',
            stepIndex: step++,
            createdAt,
            content: texts.join('\n\n'),
            thinking: toolUseBlocks.length === 0 ? thinkingText : undefined,
            tokens: toolUseBlocks.length === 0 ? itemTokens : undefined,
            modelInfo,
          });
        }

        // Emit tool calls turn if present
        if (toolUseBlocks.length > 0) {
          const tools: ToolCallItem[] = toolUseBlocks.map((tu: any, idx: number) => {
            const toolId = tu.id || `tool-${step}-${idx}`;
            const toolName = tu.name || 'tool';
            const args = tu.input || {};
            const summary = getToolSummary(toolName, args);

            const result = toolResults.get(toolId);
            const outputContent = result ? result.content : '';
            const status = result ? (result.isError ? 'ERROR' : 'DONE') : 'DONE';

            let fileOperation: FileOperationInfo | undefined;
            const lowerName = toolName.toLowerCase();
            if (lowerName === 'write' || lowerName === 'write_file') {
              fileOperation = {
                type: 'write',
                path: args.file_path || args.path || '',
                content: args.content !== undefined ? String(args.content) : '',
              };
            } else if (lowerName === 'edit' || lowerName === 'edit_file') {
              fileOperation = {
                type: 'edit',
                path: args.file_path || args.path || '',
                target: args.old_string || args.target,
                replacement: args.new_string || args.replacement || '',
              };
            }

            return {
              id: toolId,
              name: toolName,
              args,
              summaryText: summary,
              outputContent,
              status,
              stepIndexCall: step,
              createdAt,
              fileOperation,
            };
          });

          timeline.push({
            id: firstChunk.uuid ? `claude-tools-${firstChunk.uuid}` : `claude-tools-${step}`,
            type: 'tool_call',
            stepIndex: step++,
            createdAt,
            tools,
            thinking: thinkingText,
            tokens: itemTokens,
            modelInfo,
          });
        }

        continue;
      }

      // --- SYSTEM MESSAGES ---
      if (t === 'system') {
        const subtype = r.subtype;
        const contentStr = typeof r.content === 'string' ? r.content.trim() : '';
        const strippedText = contentStr.replace(/<[^>]+>/g, '').trim();

        // Filter out empty turn durations, heartbeats, and hollow wrappers (e.g. empty <local-command-stdout>);
        // surface actionable summaries or slash commands with substantive text
        if (strippedText && ['local_command', 'bridge_status', 'away_summary'].includes(subtype)) {
          const createdAt = formatTimestamp(r.timestamp || r.created_at);
          timeline.push({
            id: r.uuid ? `claude-sys-${r.uuid}` : `claude-sys-${step}`,
            type: 'system_message',
            stepIndex: step++,
            createdAt,
            content: contentStr,
          });
        }
        i++;
        continue;
      }

      i++;
    }

    // Determine totalTokens: prefer cost-state if present
    if (costStateRecord?.modelUsage) {
      for (const modelKey of Object.keys(costStateRecord.modelUsage)) {
        const m = costStateRecord.modelUsage[modelKey];
        if (m) {
          totalTokens +=
            (m.inputTokens || 0) +
            (m.outputTokens || 0) +
            (m.cacheReadInputTokens || 0);
        }
      }
    } else {
      // Fallback: sum tokens from timeline items
      for (const item of timeline) {
        if (item.tokens) {
          totalTokens +=
            (item.tokens.input || 0) +
            (item.tokens.output || 0) +
            (item.tokens.cacheRead || 0);
        }
      }
    }

    return {
      platform: {
        id: claudeCodeParser.id,
        name: claudeCodeParser.name,
        dotColor: claudeCodeParser.dotColor,
        badgeClass: claudeCodeParser.badgeClass,
      },
      timeline,
      recordCount: records.length,
      totalTokens,
    };
  },
};

function extractToolOutput(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object' && block.text) return block.text;
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }
  if (content && typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }
  return '';
}

function formatTimestamp(ts?: string | number): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'number') {
    return new Date(ts).toISOString();
  }
  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function getToolSummary(name: string, args: Record<string, any>): string {
  if (!args) return name;
  const lower = name.toLowerCase();
  if (lower === 'bash' || lower === 'run_command') {
    return args.command || args.CommandLine || name;
  }
  if (
    lower === 'write' ||
    lower === 'write_file' ||
    lower === 'edit' ||
    lower === 'edit_file' ||
    lower === 'read' ||
    lower === 'view'
  ) {
    const rawPath = args.file_path || args.path || args.Path || '';
    if (rawPath) {
      return rawPath.split('/').pop() || rawPath;
    }
  }
  return name;
}
