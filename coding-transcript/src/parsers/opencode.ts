import type { TimelineItem, ToolCallItem, ModelInfo, FileOperationInfo } from '../types';
import type { PlatformParser, ParseResult } from './types';

export const openCodeParser: PlatformParser = {
  id: 'opencode',
  name: 'OpenCode',
  dotColor: 'bg-emerald-500',
  detect(rawText: string, sampleRecords: any[]): boolean {
    if (!sampleRecords || sampleRecords.length === 0) return false;
    for (const rec of sampleRecords) {
      if (rec && typeof rec === 'object') {
        // OpenCode session exports have top-level { info: { id: "ses_...", ... }, messages: [...] }
        if (
          'info' in rec &&
          'messages' in rec &&
          rec.info &&
          typeof rec.info === 'object' &&
          (typeof rec.info.id === 'string' && rec.info.id.startsWith('ses_'))
        ) {
          return true;
        }

        // Or direct message records
        if (
          'id' in rec &&
          typeof rec.id === 'string' &&
          rec.id.startsWith('msg_') &&
          ('type' in rec || 'metadata' in rec)
        ) {
          return true;
        }
      }
    }
    return false;
  },
  parse(rawText: string): ParseResult {
    let sessionInfo: Record<string, any> | undefined;
    let messages: any[] = [];

    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        sessionInfo = parsed.info;
        if (Array.isArray(parsed.messages)) {
          messages = parsed.messages;
        }
      } else if (Array.isArray(parsed)) {
        messages = parsed;
      }
    } catch {
      // Fallback: try JSONL
      const lines = rawText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          messages.push(JSON.parse(trimmed));
        } catch {}
      }
    }

    const timeline: TimelineItem[] = [];
    let step = 0;
    let totalTokens = 0;

    // If sessionInfo has top-level token count, use it or accumulate from messages
    if (sessionInfo?.tokens) {
      const tok = sessionInfo.tokens;
      totalTokens = (tok.input || 0) + (tok.output || 0) + (tok.reasoning || 0) + (tok.cache?.read || 0);
    }

    for (const msg of messages) {
      const msgType = msg.type || (msg.metadata?.agent ? 'assistant' : 'user');
      const createdAt = formatTimestamp(msg.time?.created);

      // Extract model information
      const rawModelObj = msg.model || msg.metadata?.model || sessionInfo?.model;
      let modelInfo: ModelInfo | undefined;
      if (rawModelObj && typeof rawModelObj === 'object') {
        const modelName = rawModelObj.id || rawModelObj.modelID || rawModelObj.name;
        if (modelName) {
          modelInfo = {
            model: String(modelName),
            variant: rawModelObj.variant ? String(rawModelObj.variant) : undefined,
            provider: rawModelObj.providerID || rawModelObj.provider ? String(rawModelObj.providerID || rawModelObj.provider) : undefined,
          };
        }
      } else if (typeof rawModelObj === 'string' && rawModelObj.trim()) {
        modelInfo = {
          model: rawModelObj.trim(),
        };
      }

      // Accumulate tokens if not already computed from sessionInfo
      if (!sessionInfo?.tokens && msg.tokens) {
        totalTokens += (msg.tokens.input || 0) + (msg.tokens.output || 0) + (msg.tokens.reasoning || 0) + (msg.tokens.cache?.read || 0);
      }

      if (msgType === 'user') {
        const content = msg.text || msg.metadata?.displayText || '';
        timeline.push({
          id: msg.id || `opencode-user-${step}`,
          type: 'user_input',
          stepIndex: step++,
          createdAt,
          content,
          modelInfo,
        });
      } else if (msgType === 'assistant') {
        const contentItems: any[] = Array.isArray(msg.content) ? msg.content : [];

        // Check for reasoning
        const reasoningItems = contentItems.filter((c) => c.type === 'reasoning');
        const thinking = reasoningItems.map((c) => c.text).filter(Boolean).join('\n\n');

        // Check for tools
        const toolItems = contentItems.filter((c) => c.type === 'tool');
        if (toolItems.length > 0) {
          const tools: ToolCallItem[] = toolItems.map((t, idx) => {
            const toolName = t.name || 'tool';
            const inputArgs = t.state?.input || {};
            const summary = getToolSummary(toolName, inputArgs);
            const outputText = extractToolOutput(t.state?.content);
            const status = t.state?.status || 'DONE';
            const error = t.state?.metadata?.error || (status === 'error' ? 'Tool call failed' : undefined);

            let fileOperation: FileOperationInfo | undefined;
            if ((toolName === 'patch' || toolName === 'edit') && inputArgs) {
              const patchText = inputArgs.patchText || '';
              const matchPath = patchText.match(/\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+([^\n]+)/i);
              const path = inputArgs.path || matchPath?.[1] || '';
              fileOperation = {
                type: 'edit',
                path,
                diffText: patchText || undefined,
                target: inputArgs.old_string || inputArgs.target || undefined,
                replacement: inputArgs.new_string || inputArgs.replacement || undefined,
              };
            } else if ((toolName === 'write' || toolName === 'write_file') && inputArgs) {
              fileOperation = {
                type: 'write',
                path: inputArgs.path || inputArgs.Path || '',
                content:
                  inputArgs.content !== undefined
                    ? String(inputArgs.content)
                    : inputArgs.text !== undefined
                    ? String(inputArgs.text)
                    : '',
              };
            }

            return {
              id: t.id || `tool-${step}-${idx}`,
              name: toolName,
              args: inputArgs,
              summaryText: summary,
              outputContent: outputText,
              status: status.toUpperCase(),
              error,
              thinking: thinking || undefined,
              stepIndexCall: step,
              createdAt: formatTimestamp(t.time?.created) || createdAt,
              fileOperation,
            };
          });

          const itemTokens = msg.tokens
            ? {
                input: msg.tokens.input,
                output: msg.tokens.output,
                cacheRead: msg.tokens.cache?.read,
              }
            : undefined;

          timeline.push({
            id: `opencode-tools-${msg.id || step}`,
            type: 'tool_call',
            stepIndex: step++,
            createdAt,
            tools,
            tokens: itemTokens,
            modelInfo,
          });
        }

        // Check for text content
        const textItems = contentItems.filter((c) => c.type === 'text');
        const textContent = textItems.map((c) => c.text).filter(Boolean).join('\n\n');

        if (textContent || thinking) {
          const itemTokens = msg.tokens
            ? {
                input: msg.tokens.input,
                output: msg.tokens.output,
                cacheRead: msg.tokens.cache?.read,
              }
            : undefined;

          timeline.push({
            id: msg.id || `opencode-model-${step}`,
            type: 'model_response',
            stepIndex: step++,
            createdAt,
            content: textContent,
            thinking: thinking || undefined,
            status: msg.outcome || undefined,
            tokens: itemTokens,
            modelInfo,
          });
        }
      } else if (msgType === 'idle') {
        // Idle status update / heartbeat
        continue;
      } else {
        // Generic / system
        timeline.push({
          id: msg.id || `opencode-sys-${step}`,
          type: 'system_message',
          stepIndex: step++,
          createdAt,
          content: msg.text || JSON.stringify(msg, null, 2),
        });
      }
    }

    return {
      platform: {
        id: openCodeParser.id,
        name: openCodeParser.name,
        dotColor: openCodeParser.dotColor,
      },
      timeline,
      recordCount: messages.length,
      totalTokens,
    };
  },
};

function formatTimestamp(timestamp?: number | string): string {
  if (!timestamp) return new Date().toISOString();
  if (typeof timestamp === 'number') {
    return new Date(timestamp).toISOString();
  }
  return timestamp;
}

function extractToolOutput(content?: any[]): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        return item.text || JSON.stringify(item, null, 2);
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function getToolSummary(name: string, args: Record<string, any>): string {
  if (!args) return name;
  if (name === 'shell' || name === 'bash') {
    return args.command || name;
  }
  if (name === 'read') {
    return args.path || name;
  }
  if (name === 'write' || name === 'edit') {
    return args.path || name;
  }
  return Object.values(args).join(' ') || name;
}
