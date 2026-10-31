import { describe, it, expect } from 'bun:test';
import {
  parseXmlBlocks,
  isTagDefaultCollapsed,
  DEFAULT_COLLAPSED_TAGS,
  DEFAULT_EXPANDED_TAGS,
} from '../../src/utils/xmlParser';

describe('XML Parsing Utility (parseXmlBlocks)', () => {
  describe('Tag Decomposition', () => {
    it('correctly parses a single isolated XML block', () => {
      const input = '<USER_REQUEST>Fix the login authentication bug</USER_REQUEST>';
      const blocks = parseXmlBlocks(input);

      expect(blocks.length).toBe(1);
      const b0 = blocks[0]!;
      expect(b0.isTag).toBe(true);
      expect(b0.tagName).toBe('USER_REQUEST');
      expect(b0.content).toBe('Fix the login authentication bug');
    });

    it('correctly splits text into alternating plain text chunks and XML blocks', () => {
      const input = 'Intro text\n<SKILL>skill contents</SKILL>\nOutro text';
      const blocks = parseXmlBlocks(input);

      expect(blocks.length).toBe(3);

      const [b0, b1, b2] = blocks;
      expect(b0!.isTag).toBe(false);
      expect(b0!.tagName).toBe('text');
      expect(b0!.content).toBe('Intro text');

      expect(b1!.isTag).toBe(true);
      expect(b1!.tagName).toBe('SKILL');
      expect(b1!.content).toBe('skill contents');

      expect(b2!.isTag).toBe(false);
      expect(b2!.tagName).toBe('text');
      expect(b2!.content).toBe('Outro text');
    });

    it('extracts multiple sequential XML tags', () => {
      const input = '<NOTE>First note</NOTE>\n<CONTEXT>Some context</CONTEXT>';
      const blocks = parseXmlBlocks(input);

      expect(blocks.length).toBe(2);
      const [b0, b1] = blocks;
      expect(b0!.isTag).toBe(true);
      expect(b0!.tagName).toBe('NOTE');
      expect(b0!.content).toBe('First note');

      expect(b1!.isTag).toBe(true);
      expect(b1!.tagName).toBe('CONTEXT');
      expect(b1!.content).toBe('Some context');
    });
  });

  describe('Nested & Interleaved Tags', () => {
    it('captures outermost tag block and allows recursive parsing of nested tags', () => {
      const input = '<USER_REQUEST>Please use <SKILL>git-helper</SKILL> to stage files</USER_REQUEST>';
      const outerBlocks = parseXmlBlocks(input);

      expect(outerBlocks.length).toBe(1);
      const outer0 = outerBlocks[0]!;
      expect(outer0.isTag).toBe(true);
      expect(outer0.tagName).toBe('USER_REQUEST');
      expect(outer0.content).toBe('Please use <SKILL>git-helper</SKILL> to stage files');

      // Recursively parse inner content
      const innerBlocks = parseXmlBlocks(outer0.content);
      expect(innerBlocks.length).toBe(3);

      const [in0, in1, in2] = innerBlocks;
      expect(in0!.isTag).toBe(false);
      expect(in0!.content).toBe('Please use');

      expect(in1!.isTag).toBe(true);
      expect(in1!.tagName).toBe('SKILL');
      expect(in1!.content).toBe('git-helper');

      expect(in2!.isTag).toBe(false);
      expect(in2!.content).toBe('to stage files');
    });

    it('handles duplicate opening tags by binding to innermost opening tag', () => {
      const input = 'Refer to <NOTE> docs first:\n\n<NOTE>Actual important note</NOTE>';
      const blocks = parseXmlBlocks(input);

      expect(blocks.length).toBe(2);
      const [b0, b1] = blocks;
      expect(b0!.isTag).toBe(false);
      expect(b0!.content).toContain('Refer to <NOTE> docs first:');

      expect(b1!.isTag).toBe(true);
      expect(b1!.tagName).toBe('NOTE');
      expect(b1!.content).toBe('Actual important note');
    });
  });

  describe('Edge Cases', () => {
    it('returns empty array when given empty string', () => {
      expect(parseXmlBlocks('')).toEqual([]);
    });

    it('returns single plain text block when no XML tags are present', () => {
      const text = 'Hello, this is regular markdown text without tags.';
      const blocks = parseXmlBlocks(text);

      expect(blocks.length).toBe(1);
      const b0 = blocks[0]!;
      expect(b0.isTag).toBe(false);
      expect(b0.tagName).toBe('text');
      expect(b0.content).toBe(text);
    });

    it('handles tags with attributes properly', () => {
      const input = '<CUSTOM_TAG id="123" enabled="true">Config payload</CUSTOM_TAG>';
      const blocks = parseXmlBlocks(input);

      expect(blocks.length).toBe(1);
      const b0 = blocks[0]!;
      expect(b0.isTag).toBe(true);
      expect(b0.tagName).toBe('CUSTOM_TAG');
      expect(b0.content).toBe('Config payload');
    });

    it('handles tags with empty inner content', () => {
      const input = '<EMPTY_BLOCK></EMPTY_BLOCK>';
      const blocks = parseXmlBlocks(input);

      expect(blocks.length).toBe(1);
      const b0 = blocks[0]!;
      expect(b0.isTag).toBe(true);
      expect(b0.tagName).toBe('EMPTY_BLOCK');
      expect(b0.content).toBe('');
    });

    it('gracefully treats unclosed tags as plain text', () => {
      const input = '<UNCLOSED_TAG>Missing closing tag text';
      const blocks = parseXmlBlocks(input);

      expect(blocks.length).toBe(1);
      const b0 = blocks[0]!;
      expect(b0.isTag).toBe(false);
      expect(b0.content).toBe(input);
    });

    it('gracefully treats mismatched closing tags as plain text', () => {
      const input = '<OPEN_A>Content with mismatched close</CLOSE_B>';
      const blocks = parseXmlBlocks(input);

      expect(blocks.length).toBe(1);
      const b0 = blocks[0]!;
      expect(b0.isTag).toBe(false);
      expect(b0.content).toBe(input);
    });
  });

  describe('Tag Collapse Defaults (isTagDefaultCollapsed)', () => {
    it('returns false for USER_REQUEST (always expanded by default)', () => {
      expect(isTagDefaultCollapsed('USER_REQUEST')).toBe(false);
      expect(isTagDefaultCollapsed('USER_REQUEST', true)).toBe(false);
      expect(isTagDefaultCollapsed('user_request', true)).toBe(false);
    });

    it('returns true for ADDITIONAL_METADATA and USER_SETTINGS_CHANGE (collapsed by default)', () => {
      expect(isTagDefaultCollapsed('ADDITIONAL_METADATA')).toBe(true);
      expect(isTagDefaultCollapsed('ADDITIONAL_METADATA', false)).toBe(true);
      expect(isTagDefaultCollapsed('additional_metadata', false)).toBe(true);

      expect(isTagDefaultCollapsed('USER_SETTINGS_CHANGE')).toBe(true);
      expect(isTagDefaultCollapsed('USER_SETTINGS_CHANGE', false)).toBe(true);
      expect(isTagDefaultCollapsed('user_settings_change', false)).toBe(true);
    });

    it('falls back to provided fallback value for unconfigured tags', () => {
      expect(isTagDefaultCollapsed('CUSTOM_TAG', false)).toBe(false);
      expect(isTagDefaultCollapsed('CUSTOM_TAG', true)).toBe(true);
      expect(isTagDefaultCollapsed('UNKNOWN_TAG')).toBe(false);
    });

    it('exposes DEFAULT_COLLAPSED_TAGS and DEFAULT_EXPANDED_TAGS sets', () => {
      expect(DEFAULT_COLLAPSED_TAGS.has('ADDITIONAL_METADATA')).toBe(true);
      expect(DEFAULT_COLLAPSED_TAGS.has('USER_SETTINGS_CHANGE')).toBe(true);
      expect(DEFAULT_EXPANDED_TAGS.has('USER_REQUEST')).toBe(true);
    });
  });
});
