import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectAndParse } from '../../src/parsers';
import { antigravityParser } from '../../src/parsers/antigravity';
import { openCodeParser } from '../../src/parsers/opencode';
import { claudeCodeParser } from '../../src/parsers/claude-code';
import { standardChatParser } from '../../src/parsers/standard-chat';

const antigravityFixturePath = resolve(import.meta.dir, '../../fixtures/audigma.antigravity.jsonl');
const opencodeFixturePath = resolve(import.meta.dir, '../../fixtures/audigma.opencode.json');

const antigravityRaw = readFileSync(antigravityFixturePath, 'utf8');
const opencodeRaw = readFileSync(opencodeFixturePath, 'utf8');

function extractSampleRecords(rawText: string, maxSamples = 5): any[] {
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

describe('Platform Auto-Detection (detectAndParse)', () => {
  describe('Positive Detection', () => {
    it('correctly auto-detects audigma.antigravity.jsonl as antigravity', () => {
      const result = detectAndParse(antigravityRaw);
      expect(result.platform.id).toBe('antigravity');
      expect(result.platform.name).toBe('Antigravity');
    });

    it('correctly auto-detects audigma.opencode.json as opencode', () => {
      const result = detectAndParse(opencodeRaw);
      expect(result.platform.id).toBe('opencode');
      expect(result.platform.name).toBe('OpenCode');
    });
  });

  describe('False-Positive / Collision Resistance', () => {
    it('audigma.antigravity.jsonl does not falsely trigger other parsers', () => {
      const samples = extractSampleRecords(antigravityRaw);
      expect(openCodeParser.detect(antigravityRaw, samples)).toBe(false);
      expect(claudeCodeParser.detect(antigravityRaw, samples)).toBe(false);
      expect(standardChatParser.detect(antigravityRaw, samples)).toBe(false);
    });

    it('audigma.opencode.json does not falsely trigger other parsers', () => {
      const samples = extractSampleRecords(opencodeRaw);
      expect(antigravityParser.detect(opencodeRaw, samples)).toBe(false);
      expect(claudeCodeParser.detect(opencodeRaw, samples)).toBe(false);
      expect(standardChatParser.detect(opencodeRaw, samples)).toBe(false);
    });
  });

  describe('Forced Platform Override', () => {
    it('forces openCodeParser when forcedPlatformId is opencode', () => {
      const result = detectAndParse(antigravityRaw, 'opencode');
      expect(result.platform.id).toBe('opencode');
    });

    it('forces antigravityParser when forcedPlatformId is antigravity', () => {
      const result = detectAndParse(opencodeRaw, 'antigravity');
      expect(result.platform.id).toBe('antigravity');
    });
  });

  describe('Edge Cases & Fallbacks', () => {
    it('returns unknown platform and empty timeline for empty string', () => {
      const result = detectAndParse('');
      expect(result.platform.id).toBe('unknown');
      expect(result.timeline).toEqual([]);
      expect(result.totalTokens).toBe(0);
      expect(result.recordCount).toBe(0);
    });

    it('returns unknown platform and empty timeline for whitespace-only input', () => {
      const result = detectAndParse('   \n\t  \n  ');
      expect(result.platform.id).toBe('unknown');
      expect(result.timeline).toEqual([]);
      expect(result.totalTokens).toBe(0);
      expect(result.recordCount).toBe(0);
    });

    it('safely falls back to default fallback without throwing on malformed JSON', () => {
      expect(() => {
        const result = detectAndParse('{"broken json: true, ');
        expect(result.platform.id).toBe('antigravity');
        expect(Array.isArray(result.timeline)).toBe(true);
      }).not.toThrow();
    });

    it('safely falls back to default fallback without throwing on arbitrary unstructured text', () => {
      expect(() => {
        const result = detectAndParse('2026-10-31 12:00:00 [INFO] System booted\nRandom unstructured log lines\n');
        expect(result.platform.id).toBe('antigravity');
        expect(Array.isArray(result.timeline)).toBe(true);
      }).not.toThrow();
    });
  });
});
