import type { RawTranscriptRecord, TimelineItem, ToolCallItem, ModelInfo, FileOperationInfo } from '../types';
import type { PlatformParser, ParseResult } from './types';

export const antigravityParser: PlatformParser = {
  id: 'antigravity',
  name: 'Antigravity',
  dotColor: 'bg-blue-500',
  detect(rawText: string, sampleRecords: any[]): boolean {
    if (!sampleRecords || sampleRecords.length === 0) return false;
    for (const rec of sampleRecords) {
      if (
        rec &&
        typeof rec === 'object' &&
        'step_index' in rec &&
        ('source' in rec || 'tool_calls' in rec || rec.type === 'USER_INPUT' || rec.type === 'PLANNER_RESPONSE')
      ) {
        return true;
      }
    }
    return false;
  },
  parse(rawText: string): ParseResult {
    const records = parseJsonlRecords(rawText);
    const timeline = buildAntigravityTimeline(records);

    let totalTokens = 0;
    for (const r of records) {
      totalTokens += (r.input_tokens || 0) + (r.output_tokens || 0) + (r.cache_read_tokens || 0);
    }

    return {
      platform: {
        id: antigravityParser.id,
        name: antigravityParser.name,
        dotColor: antigravityParser.dotColor,
      },
      timeline,
      recordCount: records.length,
      totalTokens,
    };
  },
};

function parseJsonlRecords(rawText: string): RawTranscriptRecord[] {
  const lines = rawText.split('\n');
  const records: RawTranscriptRecord[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      records.push(parsed);
    } catch {
      // skip unparseable lines
    }
  }
  return records;
}

function parseModelFromContent(content?: string): ModelInfo | undefined {
  if (!content) return undefined;
  // Match: setting `Model Selection` (from ... )?to <model-name>.
  const match = content.match(/setting\s+`Model Selection`\s+(?:from\s+.*?\s+)?to\s+([^\n]+?)\.(?:\s|$)/i);
  const matchName = match?.[1];
  if (!matchName) return undefined;

  const raw = matchName.trim();
  const variantMatch = raw.match(/^(.*?)\s*\(([^)]+)\)$/);
  const variantModel = variantMatch?.[1];
  const variantType = variantMatch?.[2];
  if (variantModel && variantType) {
    return {
      model: variantModel.trim(),
      variant: variantType.trim(),
      provider: undefined,
    };
  }
  return {
    model: raw,
    variant: undefined,
    provider: undefined,
  };
}

function buildAntigravityTimeline(records: RawTranscriptRecord[]): TimelineItem[] {
  const timeline: TimelineItem[] = [];
  let currentModelInfo: ModelInfo | undefined;
  let step = 0;
  let i = 0;

  while (i < records.length) {
    const rec = records[i];
    if (!rec) {
      i++;
      continue;
    }

    // Check if user input updates model settings
    const detectedModel = parseModelFromContent(rec.content);
    if (detectedModel) {
      currentModelInfo = detectedModel;
    }

    // Case 1: USER_INPUT
    if (rec.source === 'USER_EXPLICIT' && rec.type === 'USER_INPUT') {
      timeline.push({
        id: `turn-user-${step}`,
        type: 'user_input',
        stepIndex: step++,
        createdAt: rec.created_at,
        status: rec.status,
        content: rec.content || '',
        media: rec.media,
      });
      i++;
      continue;
    }

    // Case 2: SYSTEM_MESSAGE
    if (rec.type === 'SYSTEM_MESSAGE' || rec.source === 'SYSTEM') {
      timeline.push({
        id: `system-${step}`,
        type: 'system_message',
        stepIndex: step++,
        createdAt: rec.created_at,
        status: rec.status,
        content: rec.content || '',
      });
      i++;
      continue;
    }

    // Case 3: MODEL PLANNER_RESPONSE with tool_calls
    if (rec.source === 'MODEL' && rec.type === 'PLANNER_RESPONSE' && rec.tool_calls && rec.tool_calls.length > 0) {
      const tools: ToolCallItem[] = [];
      const currentStep = step++;
      const createdAt = rec.created_at;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheReadTokens = 0;
      const thinkingParts: string[] = [];

      while (i < records.length) {
        const toolCallRec = records[i];
        if (
          !toolCallRec ||
          toolCallRec.source !== 'MODEL' ||
          toolCallRec.type !== 'PLANNER_RESPONSE' ||
          !toolCallRec.tool_calls ||
          toolCallRec.tool_calls.length === 0
        ) {
          break;
        }

        totalInputTokens += toolCallRec.input_tokens || 0;
        totalOutputTokens += toolCallRec.output_tokens || 0;
        totalCacheReadTokens += toolCallRec.cache_read_tokens || 0;
        if (toolCallRec.thinking && toolCallRec.thinking.trim()) {
          thinkingParts.push(toolCallRec.thinking.trim());
        }

        for (const tc of toolCallRec.tool_calls) {
          const toolId = `tool-${toolCallRec.step_index}-${tc.name}`;
          const summary = getToolSummary(tc.name, tc.args);

          let outputContent = '';
          let resultStepIndex: number | undefined;
          let toolStatus = toolCallRec.status || 'DONE';
          let error = toolCallRec.error;

          const nextRec = records[i + 1];
          if (nextRec && nextRec.type === 'GENERIC') {
            outputContent = nextRec.content || '';
            resultStepIndex = nextRec.step_index;
            if (nextRec.status) toolStatus = nextRec.status;
            if (nextRec.error) error = nextRec.error;
            i++; // consume result record
          }

          let fileOperation: FileOperationInfo | undefined;
          if (tc.name === 'edit_file' && tc.args) {
            fileOperation = {
              type: 'edit',
              path: tc.args.Path || '',
              target: tc.args.Target !== undefined ? String(tc.args.Target) : undefined,
              replacement: tc.args.Replacement !== undefined ? String(tc.args.Replacement) : '',
            };
          } else if (tc.name === 'write_file' && tc.args) {
            fileOperation = {
              type: 'write',
              path: tc.args.Path || '',
              content: tc.args.Content !== undefined ? String(tc.args.Content) : '',
            };
          }

          tools.push({
            id: toolId,
            name: tc.name,
            args: tc.args,
            summaryText: summary,
            outputContent,
            status: toolStatus,
            error,
            thinking: toolCallRec.thinking?.trim() || undefined,
            stepIndexCall: currentStep,
            stepIndexResult: resultStepIndex,
            createdAt: toolCallRec.created_at,
            fileOperation,
          });
        }
        i++;
      }

      timeline.push({
        id: `tools-${currentStep}`,
        type: 'tool_call',
        stepIndex: currentStep,
        createdAt,
        tools,
        thinking: thinkingParts.length > 0 ? thinkingParts.join('\n\n') : undefined,
        tokens: {
          input: totalInputTokens,
          output: totalOutputTokens,
          cacheRead: totalCacheReadTokens,
        },
        modelInfo: currentModelInfo ? { ...currentModelInfo } : undefined,
      });
      continue;
    }

    // Case 4: MODEL PLANNER_RESPONSE with text response
    if (rec.source === 'MODEL' && (rec.type === 'PLANNER_RESPONSE' || rec.type === 'GENERIC')) {
      timeline.push({
        id: `turn-model-${step}`,
        type: 'model_response',
        stepIndex: step++,
        createdAt: rec.created_at,
        status: rec.status,
        content: rec.content || '',
        thinking: rec.thinking || '',
        tokens: {
          input: rec.input_tokens,
          output: rec.output_tokens,
          cacheRead: rec.cache_read_tokens,
        },
        modelInfo: currentModelInfo ? { ...currentModelInfo } : undefined,
      });
      i++;
      continue;
    }

    // Fallback
    timeline.push({
      id: `record-${step}`,
      type: 'system_message',
      stepIndex: step++,
      createdAt: rec.created_at,
      status: rec.status,
      content: rec.content || JSON.stringify(rec, null, 2),
    });
    i++;
  }

  return timeline;
}

function getToolSummary(name: string, args: Record<string, any>): string {
  if (!args) return name;
  if (name === 'run_command' && args.CommandLine) {
    return args.CommandLine;
  }
  if (name === 'read_file' && args.Path) {
    const path = args.Path.split('/').pop() || args.Path;
    if (args.StartLine && args.EndLine) {
      return `${path}:${args.StartLine}-${args.EndLine}`;
    }
    return path;
  }
  if ((name === 'edit_file' || name === 'write_file') && args.Path) {
    return args.Path.split('/').pop() || args.Path;
  }
  if (args.toolSummary) {
    return args.toolSummary;
  }
  return name;
}
