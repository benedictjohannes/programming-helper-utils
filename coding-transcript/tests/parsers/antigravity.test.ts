import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { antigravityParser } from '../../src/parsers/antigravity';
import type { TimelineItemType } from '../../src/types';

const fixturePath = resolve(import.meta.dir, '../../fixtures/audigma.antigravity.jsonl');
const fixtureRaw = readFileSync(fixturePath, 'utf8');

describe('Antigravity Parser (antigravityParser)', () => {
  const result = antigravityParser.parse(fixtureRaw);

  describe('Record & Turn Integrity', () => {
    it('parses records and produces a non-empty timeline', () => {
      expect(result.recordCount).toBeGreaterThan(0);
      expect(result.timeline.length).toBeGreaterThan(0);
    });

    it('ensures each turn has valid id, known type, and ISO createdAt timestamp', () => {
      const validTypes: TimelineItemType[] = ['user_input', 'tool_call', 'model_response', 'system_message'];

      for (const item of result.timeline) {
        expect(typeof item.id).toBe('string');
        expect(item.id.length).toBeGreaterThan(0);

        expect(validTypes).toContain(item.type);

        expect(typeof item.createdAt).toBe('string');
        const parsedDate = Date.parse(item.createdAt);
        expect(Number.isNaN(parsedDate)).toBe(false);
      }
    });

    it('generates normalized TimelineItem[] with contiguous stepIndex values', () => {
      result.timeline.forEach((item, index) => {
        expect(item.stepIndex).toBe(index);
      });
    });
  });

  describe('Tool Invocation & Result Pairing', () => {
    const toolTurns = result.timeline.filter((item) => item.type === 'tool_call');
    const allTools = toolTurns.flatMap((item) => item.tools || []);

    it('contains tool calls paired with results', () => {
      expect(toolTurns.length).toBeGreaterThan(0);
      expect(allTools.length).toBeGreaterThan(0);
    });

    it('accurately populates outputContent and status on tool calls', () => {
      for (const tool of allTools) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.args).toBe('object');
        expect(tool.args).not.toBeNull();

        expect(typeof tool.outputContent).toBe('string');
        expect(typeof tool.status).toBe('string');
        expect(tool.status.length).toBeGreaterThan(0);
      }
    });

    it('verifies file modification tools (edit_file, write_file) parse target and replacement contents', () => {
      const editTools = allTools.filter((t) => t.name === 'edit_file');
      const writeTools = allTools.filter((t) => t.name === 'write_file');

      expect(editTools.length).toBeGreaterThan(0);
      expect(writeTools.length).toBeGreaterThan(0);

      for (const edit of editTools) {
        expect(typeof edit.args.Path).toBe('string');
        expect(typeof edit.args.Target).toBe('string');
        expect(typeof edit.args.Replacement).toBe('string');

        // Check normalized fileOperation property
        expect(edit.fileOperation).toBeDefined();
        expect(edit.fileOperation!.type).toBe('edit');
        expect(edit.fileOperation!.path).toBe(edit.args.Path);
        expect(edit.fileOperation!.target).toBe(edit.args.Target);
        expect(edit.fileOperation!.replacement).toBe(edit.args.Replacement);
      }

      for (const write of writeTools) {
        expect(typeof write.args.Path).toBe('string');
        expect(typeof write.args.Content).toBe('string');

        // Check normalized fileOperation property
        expect(write.fileOperation).toBeDefined();
        expect(write.fileOperation!.type).toBe('write');
        expect(write.fileOperation!.path).toBe(write.args.Path);
        expect(write.fileOperation!.content).toBe(write.args.Content);
      }
    });
  });

  describe('Thinking / Reasoning Blocks', () => {
    it('extracts thinking text when present on model turns', () => {
      const thinkingTurns = result.timeline.filter(
        (item) => typeof item.thinking === 'string' && item.thinking.trim().length > 0
      );
      expect(thinkingTurns.length).toBeGreaterThan(0);

      for (const turn of thinkingTurns) {
        expect(turn.thinking!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Token Accounting', () => {
    it('sums input, output, cacheRead, and verifies totalTokens > 0', () => {
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('populates non-negative token metrics on timeline items having tokens', () => {
      const turnsWithTokens = result.timeline.filter((item) => item.tokens !== undefined);
      expect(turnsWithTokens.length).toBeGreaterThan(0);

      for (const turn of turnsWithTokens) {
        if (turn.tokens?.input !== undefined) {
          expect(turn.tokens.input).toBeGreaterThanOrEqual(0);
        }
        if (turn.tokens?.output !== undefined) {
          expect(turn.tokens.output).toBeGreaterThanOrEqual(0);
        }
        if (turn.tokens?.cacheRead !== undefined) {
          expect(turn.tokens.cacheRead).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('XML Preservation', () => {
    it('preserves XML tags in user_input content for downstream XML bubble parsing', () => {
      const userTurns = result.timeline.filter((item) => item.type === 'user_input');
      const xmlTurns = userTurns.filter(
        (item) =>
          item.content?.includes('<USER_REQUEST>') ||
          item.content?.includes('<SKILL>') ||
          item.content?.includes('<ADDITIONAL_METADATA>')
      );

      expect(xmlTurns.length).toBeGreaterThan(0);
      for (const turn of xmlTurns) {
        expect(turn.content).toBeDefined();
        // Check that tag syntax is preserved intact
        expect(turn.content).toMatch(/<[A-Za-z0-9_-]+>/);
      }
    });
  });
});
