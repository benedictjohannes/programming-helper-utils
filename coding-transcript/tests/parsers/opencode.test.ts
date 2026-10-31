import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openCodeParser } from '../../src/parsers/opencode';
import type { TimelineItemType } from '../../src/types';

const fixturePath = resolve(import.meta.dir, '../../fixtures/audigma.opencode.json');
const fixtureRaw = readFileSync(fixturePath, 'utf8');

describe('OpenCode Parser (openCodeParser)', () => {
  const result = openCodeParser.parse(fixtureRaw);

  describe('Message Normalization', () => {
    it('decomposes multi-part messages into timeline items', () => {
      expect(result.recordCount).toBeGreaterThan(0);
      expect(result.timeline.length).toBeGreaterThan(0);
      // Timeline should contain both user_input, model_response, and tool_call
      const types = new Set(result.timeline.map((item) => item.type));
      expect(types.has('user_input')).toBe(true);
      expect(types.has('tool_call')).toBe(true);
      expect(types.has('model_response')).toBe(true);
    });

    it('maps reasoning parts to TimelineItem.thinking', () => {
      const thinkingItems = result.timeline.filter(
        (item) => typeof item.thinking === 'string' && item.thinking.trim().length > 0
      );
      expect(thinkingItems.length).toBeGreaterThan(0);
      for (const item of thinkingItems) {
        expect(item.thinking!.length).toBeGreaterThan(0);
      }
    });

    it('pairs tool invocation and result parts into ToolCallItem entries', () => {
      const toolTurns = result.timeline.filter((item) => item.type === 'tool_call');
      expect(toolTurns.length).toBeGreaterThan(0);

      const allTools = toolTurns.flatMap((item) => item.tools || []);
      expect(allTools.length).toBeGreaterThan(0);

      for (const tool of allTools) {
        expect(typeof tool.id).toBe('string');
        expect(tool.id.length).toBeGreaterThan(0);
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.args).toBe('object');
        expect(typeof tool.outputContent).toBe('string');
        expect(typeof tool.status).toBe('string');
      }

      // Check normalized fileOperation for patch tools in OpenCode
      const patchTools = allTools.filter((t) => t.name === 'patch');
      expect(patchTools.length).toBeGreaterThan(0);
      for (const pt of patchTools) {
        expect(pt.fileOperation).toBeDefined();
        expect(pt.fileOperation!.type).toBe('edit');
        expect(pt.fileOperation!.path.length).toBeGreaterThan(0);
        expect(typeof pt.fileOperation!.diffText).toBe('string');
      }
    });
  });

  describe('Token Accounting', () => {
    it('correctly calculates token metrics across session turns', () => {
      const parsedFixture = JSON.parse(fixtureRaw);
      const expectedTokens =
        (parsedFixture.info.tokens.input || 0) +
        (parsedFixture.info.tokens.output || 0) +
        (parsedFixture.info.tokens.reasoning || 0) +
        (parsedFixture.info.tokens.cache?.read || 0);

      expect(result.totalTokens).toBe(expectedTokens);
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('retains token metrics on timeline items where present', () => {
      const itemsWithTokens = result.timeline.filter((item) => item.tokens !== undefined);
      expect(itemsWithTokens.length).toBeGreaterThan(0);
      for (const item of itemsWithTokens) {
        if (item.tokens?.input !== undefined) {
          expect(item.tokens.input).toBeGreaterThanOrEqual(0);
        }
        if (item.tokens?.output !== undefined) {
          expect(item.tokens.output).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('Ordering & Metadata', () => {
    it('preserves sequential and contiguous step indexing starting from 0', () => {
      result.timeline.forEach((item, index) => {
        expect(item.stepIndex).toBe(index);
      });
    });

    it('preserves role assignments and basic metadata on timeline items', () => {
      const validTypes: TimelineItemType[] = ['user_input', 'tool_call', 'model_response', 'system_message'];

      for (const item of result.timeline) {
        expect(validTypes).toContain(item.type);
        expect(typeof item.id).toBe('string');
        expect(item.id.length).toBeGreaterThan(0);
        expect(typeof item.createdAt).toBe('string');
        expect(Number.isNaN(Date.parse(item.createdAt))).toBe(false);
      }

      // First item in audigma.opencode.json is user input
      expect(result.timeline[0]!.type).toBe('user_input');
      expect(result.timeline[0]!.content).toContain('@scratchpad/PipewireOutput.md');
    });

    it('extracts model metadata on turns where present', () => {
      const itemsWithModel = result.timeline.filter((item) => item.modelInfo !== undefined);
      expect(itemsWithModel.length).toBeGreaterThan(0);
      for (const item of itemsWithModel) {
        expect(typeof item.modelInfo?.model).toBe('string');
        expect(item.modelInfo!.model.length).toBeGreaterThan(0);
      }
    });
  });
});
