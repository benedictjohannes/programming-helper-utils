import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { claudeCodeParser } from '../../src/parsers/claude-code';
import type { TimelineItemType } from '../../src/types';

const fixturePath = resolve(import.meta.dir, '../../fixtures/audigma.claude-code.jsonl');
const fixtureRaw = readFileSync(fixturePath, 'utf8');

describe('Claude Code Parser (claudeCodeParser)', () => {
  const result = claudeCodeParser.parse(fixtureRaw);

  describe('Record & Turn Integrity', () => {
    it('parses records and produces a non-empty timeline', () => {
      expect(result.recordCount).toBe(419);
      expect(result.timeline.length).toBeGreaterThan(0);
      expect(result.platform.id).toBe('claude_code');
      expect(result.platform.name).toBe('Claude Code');
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
      expect(allTools.length).toBe(29);
    });

    it('accurately populates outputContent and status on tool calls', () => {
      for (const tool of allTools) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.args).toBe('object');
        expect(tool.args).not.toBeNull();

        expect(typeof tool.outputContent).toBe('string');
        expect(tool.outputContent!.length).toBeGreaterThan(0);
        expect(typeof tool.status).toBe('string');
        expect(['DONE', 'ERROR']).toContain(tool.status);
      }
    });

    it('populates fileOperation for Write tool call', () => {
      const writeTool = allTools.find((t) => t.name.toLowerCase() === 'write');
      expect(writeTool).toBeDefined();
      expect(writeTool?.fileOperation).toBeDefined();
      expect(writeTool?.fileOperation?.type).toBe('write');
      expect(writeTool?.fileOperation?.path).toContain('loop_timing.rs');
      expect(writeTool?.fileOperation?.content?.length).toBeGreaterThan(0);
    });
  });

  describe('Model Metadata & Thinking', () => {
    it('extracts model info on assistant responses', () => {
      const turnsWithModel = result.timeline.filter((t) => t.modelInfo);
      expect(turnsWithModel.length).toBeGreaterThan(0);

      const firstModelTurn = turnsWithModel[0]!;
      expect(firstModelTurn.modelInfo?.model).toBe('claude-sonnet-5-5');
      expect(firstModelTurn.modelInfo?.provider).toBe('anthropic');
      expect(firstModelTurn.modelInfo?.variant).toContain('effort');
    });

    it('retains thinking/reasoning indication when thinking duration is present', () => {
      const turnsWithThinking = result.timeline.filter((t) => t.thinking);
      expect(turnsWithThinking.length).toBeGreaterThan(0);
      for (const item of turnsWithThinking) {
        expect(typeof item.thinking).toBe('string');
        expect(item.thinking!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('User Input & Context Attachments', () => {
    it('parses user prompts with text content', () => {
      const userTurns = result.timeline.filter((t) => t.type === 'user_input');
      expect(userTurns.length).toBe(12);

      const firstUser = userTurns[0]!;
      expect(firstUser.content).toContain('EarlyChannelWorkers.md');
      expect(firstUser.media).toBeDefined();
      expect(firstUser.media!.length).toBeGreaterThan(0);
      expect(firstUser.media![0]?.uri).toContain('EarlyChannelWorkers.md');
    });
  });

  describe('Token Accounting', () => {
    it('computes total session tokens from cost-state or usage', () => {
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toBe(3887527);
    });

    it('populates tokens on turns where usage is present', () => {
      const turnsWithTokens = result.timeline.filter((t) => t.tokens);
      expect(turnsWithTokens.length).toBeGreaterThan(0);
      for (const item of turnsWithTokens) {
        expect(item.tokens?.input).toBeGreaterThanOrEqual(0);
        expect(item.tokens?.output).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('System Messages', () => {
    it('surfaces local slash commands and summaries as system messages', () => {
      const sysTurns = result.timeline.filter((t) => t.type === 'system_message');
      expect(sysTurns.length).toBeGreaterThan(0);
      expect(sysTurns.some((s) => s.content?.includes('/remote-control'))).toBe(true);
    });

    it('omits hollow system turns with empty stdout wrappers', () => {
      const sysTurns = result.timeline.filter((t) => t.type === 'system_message');
      const hollowTurns = sysTurns.filter((s) => s.content?.trim() === '<local-command-stdout></local-command-stdout>');
      expect(hollowTurns.length).toBe(0);
    });
  });
});
