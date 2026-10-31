import type { TimelineItem, ModelInfo } from '../types';
import type { PlatformParser, ParseResult } from './types';

export const standardChatParser: PlatformParser = {
  id: 'standard_chat',
  name: 'Standard Chat / OpenAI (Experimental)',
  dotColor: 'bg-zinc-400',
  detect(rawText: string, sampleRecords: any[]): boolean {
    if (!sampleRecords || sampleRecords.length === 0) return false;
    for (const rec of sampleRecords) {
      if (rec && typeof rec === 'object') {
        // Exclude OpenCode format
        if ('info' in rec && 'messages' in rec && rec.info?.id?.startsWith('ses_')) {
          return false;
        }
        if ('role' in rec) {
          return true;
        }
        if ('messages' in rec && Array.isArray(rec.messages)) {
          // Check if messages look like OpenAI chat (contain 'role')
          const firstMsg = rec.messages[0];
          if (firstMsg && typeof firstMsg === 'object' && 'role' in firstMsg) {
            return true;
          }
        }
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
      } else if (parsed.messages && Array.isArray(parsed.messages)) {
        records = parsed.messages;
      } else {
        records = [parsed];
      }
    } catch {
      // Try JSONL
      const lines = rawText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          records.push(JSON.parse(trimmed));
        } catch {}
      }
    }

    const timeline: TimelineItem[] = [];
    let step = 0;

    for (const msg of records) {
      const role = (msg.role || '').toLowerCase();
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2);
      const createdAt = msg.created_at || new Date().toISOString();

      let modelInfo: ModelInfo | undefined;
      const rawModel = msg.model || (msg as any).model_name;
      if (typeof rawModel === 'string' && rawModel.trim()) {
        modelInfo = {
          model: rawModel.trim(),
        };
      }

      if (role === 'user') {
        timeline.push({
          id: `std-user-${step}`,
          type: 'user_input',
          stepIndex: step++,
          createdAt,
          content,
        });
      } else if (role === 'assistant') {
        timeline.push({
          id: `std-model-${step}`,
          type: 'model_response',
          stepIndex: step++,
          createdAt,
          content,
          modelInfo,
        });
      } else if (role === 'system') {
        timeline.push({
          id: `std-sys-${step}`,
          type: 'system_message',
          stepIndex: step++,
          createdAt,
          content,
          modelInfo,
        });
      }
    }

    return {
      platform: {
        id: standardChatParser.id,
        name: standardChatParser.name,
        dotColor: standardChatParser.dotColor,
      },
      timeline,
      recordCount: records.length,
      totalTokens: 0,
    };
  },
};
