import type { PlatformParser, ParseResult } from './types';
import { antigravityParser } from './antigravity';
import { claudeCodeParser } from './claude-code';
import { openCodeParser } from './opencode';
import { standardChatParser } from './standard-chat';

export const registeredParsers: PlatformParser[] = [
  antigravityParser,
  claudeCodeParser,
  openCodeParser,
  standardChatParser,
];

export function detectAndParse(rawText: string, forcedPlatformId?: string): ParseResult {
  if (!rawText || !rawText.trim()) {
    return {
      platform: {
        id: 'unknown',
        name: 'Unknown',
        dotColor: 'bg-zinc-400',
      },
      timeline: [],
      recordCount: 0,
      totalTokens: 0,
    };
  }

  // If a platform is explicitly chosen
  if (forcedPlatformId && forcedPlatformId !== 'auto') {
    const found = registeredParsers.find((p) => p.id === forcedPlatformId);
    if (found) {
      return found.parse(rawText);
    }
  }

  // Sample records for auto detection
  const sampleRecords = getSampleRecords(rawText, 5);

  for (const parser of registeredParsers) {
    if (parser.detect(rawText, sampleRecords)) {
      return parser.parse(rawText);
    }
  }

  // Default fallback: Antigravity parser (which handles general JSONL gracefully)
  return antigravityParser.parse(rawText);
}

function getSampleRecords(rawText: string, maxSamples = 5): any[] {
  const records: any[] = [];
  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) return parsed.slice(0, maxSamples);
    if (parsed && typeof parsed === 'object') return [parsed];
  } catch {}

  const lines = rawText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
      if (records.length >= maxSamples) break;
    } catch {}
  }
  return records;
}

export * from './types';
