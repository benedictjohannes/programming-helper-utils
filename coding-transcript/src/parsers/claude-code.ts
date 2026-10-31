import type { TimelineItem, ToolCallItem, ModelInfo } from '../types';
import type { PlatformParser, ParseResult } from './types';

export const claudeCodeParser: PlatformParser = {
  id: 'claude_code',
  name: 'Claude Code (Experimental)',
  dotColor: 'bg-orange-500',
  detect(rawText: string, sampleRecords: any[]): boolean {
    if (!sampleRecords || sampleRecords.length === 0) return false;
    for (const rec of sampleRecords) {
      if (
        rec &&
        typeof rec === 'object' &&
        ('role' in rec || 'message' in rec) &&
        !('step_index' in rec)
      ) {
        if (rec.role === 'user' || rec.role === 'assistant' || rec.message?.role) {
          return true;
        }
      }
    }
    return false;
  },
  parse(rawText: string): ParseResult {
    const lines = rawText.split('\n');
    const records: any[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed));
      } catch {}
    }

    const timeline: TimelineItem[] = [];
    let step = 0;
    let totalTokens = 0;

    for (const r of records) {
      const msg = r.message || r;
      const role = msg.role;
      const createdAt = r.timestamp || r.created_at || new Date().toISOString();

      let modelInfo: ModelInfo | undefined;
      const rawModel = r.model || msg.model;
      if (typeof rawModel === 'string' && rawModel.trim()) {
        modelInfo = {
          model: rawModel.trim(),
          provider: 'anthropic',
        };
      }

      if (r.usage) {
        totalTokens += (r.usage.input_tokens || 0) + (r.usage.output_tokens || 0);
      }

      if (role === 'user') {
        let content = '';
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          // Could be tool results or text blocks
          const textBlocks = msg.content.filter((b: any) => b.type === 'text');
          content = textBlocks.map((b: any) => b.text).join('\n\n');
        }

        timeline.push({
          id: `claude-user-${step}`,
          type: 'user_input',
          stepIndex: step++,
          createdAt,
          content,
        });
      } else if (role === 'assistant') {
        if (Array.isArray(msg.content)) {
          const textBlocks = msg.content.filter((b: any) => b.type === 'text');
          const toolUseBlocks = msg.content.filter((b: any) => b.type === 'tool_use');

          if (toolUseBlocks.length > 0) {
            const tools: ToolCallItem[] = toolUseBlocks.map((tu: any, idx: number) => ({
              id: tu.id || `tool-${step}-${idx}`,
              name: tu.name,
              args: tu.input || {},
              summaryText: tu.name,
              status: 'DONE',
              stepIndexCall: step,
              createdAt,
            }));

            timeline.push({
              id: `claude-tools-${step}`,
              type: 'tool_call',
              stepIndex: step++,
              createdAt,
              tools,
              modelInfo,
            });
          }

          if (textBlocks.length > 0) {
            const text = textBlocks.map((b: any) => b.text).join('\n\n');
            timeline.push({
              id: `claude-model-${step}`,
              type: 'model_response',
              stepIndex: step++,
              createdAt,
              content: text,
              modelInfo,
            });
          }
        } else if (typeof msg.content === 'string') {
          timeline.push({
            id: `claude-model-${step}`,
            type: 'model_response',
            stepIndex: step++,
            createdAt,
            content: msg.content,
            modelInfo,
          });
        }
      }
    }

    return {
      platform: {
        id: claudeCodeParser.id,
        name: claudeCodeParser.name,
        dotColor: claudeCodeParser.dotColor,
      },
      timeline,
      recordCount: records.length,
      totalTokens,
    };
  },
};
