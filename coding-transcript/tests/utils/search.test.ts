import { describe, it, expect } from 'bun:test';
import { searchTimeline, type FilterOptions } from '../../src/utils/search';
import type { TimelineItem } from '../../src/types';

describe('Search Utility (searchTimeline)', () => {
  const allFilters: FilterOptions = {
    userInput: true,
    modelResponse: true,
    toolInput: true,
    toolOutput: true,
    systemMessage: true,
  };

  const sampleTimeline: TimelineItem[] = [
    {
      id: 'turn-0',
      type: 'user_input',
      stepIndex: 0,
      createdAt: '2026-10-31T10:00:00Z',
      content: 'Can you help inspect the authentication pipeline for any security vulnerabilities?',
    },
    {
      id: 'turn-1',
      type: 'model_response',
      stepIndex: 1,
      createdAt: '2026-10-31T10:00:05Z',
      content: 'I will analyze the authentication pipeline by searching for password hashing logic.',
      thinking: 'We should check if argon2 or bcrypt is being utilized securely.',
    },
    {
      id: 'turn-2',
      type: 'tool_call',
      stepIndex: 2,
      createdAt: '2026-10-31T10:00:10Z',
      tools: [
        {
          id: 'tool-2-read_file',
          name: 'read_file',
          args: { Path: '/src/auth/service.py', StartLine: 1, EndLine: 50 },
          summaryText: 'service.py:1-50',
          outputContent: 'def verify_password(hash, candidate):\n    return check_hash(hash, candidate)',
          status: 'DONE',
          thinking: 'Inspecting password verification implementation',
          stepIndexCall: 2,
          createdAt: '2026-10-31T10:00:10Z',
        },
      ],
    },
    {
      id: 'turn-3',
      type: 'system_message',
      stepIndex: 3,
      createdAt: '2026-10-31T10:00:15Z',
      content: 'Session token refreshed by auth daemon.',
    },
  ];

  describe('Indexing & Matching', () => {
    it('returns empty array when query is empty or whitespace-only', () => {
      expect(searchTimeline(sampleTimeline, '', allFilters)).toEqual([]);
      expect(searchTimeline(sampleTimeline, '   ', allFilters)).toEqual([]);
    });

    it('finds query in user input content', () => {
      const matches = searchTimeline(sampleTimeline, 'vulnerabilities', allFilters);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.itemId).toBe('turn-0');
      expect(m0.field).toBe('user_prompt');
      expect(m0.preview.toLowerCase()).toContain('vulnerabilities');
    });

    it('finds query in model response text', () => {
      const matches = searchTimeline(sampleTimeline, 'password hashing', allFilters);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.itemId).toBe('turn-1');
      expect(m0.field).toBe('assistant_text');
      expect(m0.preview.toLowerCase()).toContain('password hashing');
    });

    it('finds query in model thinking text', () => {
      const matches = searchTimeline(sampleTimeline, 'argon2', allFilters);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.itemId).toBe('turn-1');
      expect(m0.field).toBe('assistant_text');
      expect(m0.preview.toLowerCase()).toContain('argon2');
    });

    it('finds query in tool names', () => {
      const matches = searchTimeline(sampleTimeline, 'read_file', allFilters);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.itemId).toBe('turn-2');
      expect(m0.subId).toBe('tool-2-read_file');
      expect(m0.field).toBe('tool_input');
    });

    it('finds query in tool arguments', () => {
      const matches = searchTimeline(sampleTimeline, 'service.py', allFilters);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.itemId).toBe('turn-2');
      expect(m0.subId).toBe('tool-2-read_file');
      expect(m0.field).toBe('tool_input');
      expect(m0.preview.toLowerCase()).toContain('service.py');
    });

    it('finds query in tool outputContent', () => {
      const matches = searchTimeline(sampleTimeline, 'check_hash', allFilters);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.itemId).toBe('turn-2');
      expect(m0.subId).toBe('tool-2-read_file');
      expect(m0.field).toBe('tool_output');
      expect(m0.preview.toLowerCase()).toContain('check_hash');
    });

    it('finds query in system message content', () => {
      const matches = searchTimeline(sampleTimeline, 'daemon', allFilters);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.itemId).toBe('turn-3');
      expect(m0.field).toBe('system');
      expect(m0.preview.toLowerCase()).toContain('daemon');
    });

    it('performs case-insensitive search matching', () => {
      const upperMatches = searchTimeline(sampleTimeline, 'AUTHENTICATION', allFilters);
      const lowerMatches = searchTimeline(sampleTimeline, 'authentication', allFilters);
      expect(upperMatches.length).toBe(lowerMatches.length);
      expect(upperMatches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Scope Filtering', () => {
    // Multi-hit fixture where keyword "pipeline" appears in prompt, response, and tool args
    const multiHitTimeline: TimelineItem[] = [
      {
        id: 'user-0',
        type: 'user_input',
        stepIndex: 0,
        createdAt: '2026-10-31T10:00:00Z',
        content: 'Check the audio pipeline status.',
      },
      {
        id: 'model-1',
        type: 'model_response',
        stepIndex: 1,
        createdAt: '2026-10-31T10:00:05Z',
        content: 'Investigating audio pipeline.',
      },
      {
        id: 'tool-2',
        type: 'tool_call',
        stepIndex: 2,
        createdAt: '2026-10-31T10:00:10Z',
        tools: [
          {
            id: 't-1',
            name: 'run_command',
            args: { CommandLine: 'systemctl status pipeline.service' },
            summaryText: 'status pipeline',
            outputContent: 'pipeline.service active (running)',
            status: 'DONE',
            stepIndexCall: 2,
            createdAt: '2026-10-31T10:00:10Z',
          },
        ],
      },
    ];

    it('scope "all" matches across prompt, response, and tools', () => {
      const matches = searchTimeline(multiHitTimeline, 'pipeline', allFilters);
      // user (1) + model (1) + toolInput (1) + toolOutput (1) = 4 matches
      expect(matches.length).toBe(4);
    });

    it('scope "prompt" matches only user input turns', () => {
      const promptOnly: FilterOptions = {
        userInput: true,
        modelResponse: false,
        toolInput: false,
        toolOutput: false,
        systemMessage: false,
      };
      const matches = searchTimeline(multiHitTimeline, 'pipeline', promptOnly);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.field).toBe('user_prompt');
      expect(m0.itemId).toBe('user-0');
    });

    it('scope "response" matches only model responses and reasoning', () => {
      const responseOnly: FilterOptions = {
        userInput: false,
        modelResponse: true,
        toolInput: false,
        toolOutput: false,
        systemMessage: false,
      };
      const matches = searchTimeline(multiHitTimeline, 'pipeline', responseOnly);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.field).toBe('assistant_text');
      expect(m0.itemId).toBe('model-1');
    });

    it('scope "tools" matches only tool names, arguments, and tool outputs', () => {
      const toolsOnly: FilterOptions = {
        userInput: false,
        modelResponse: false,
        toolInput: true,
        toolOutput: true,
        systemMessage: false,
      };
      const matches = searchTimeline(multiHitTimeline, 'pipeline', toolsOnly);
      expect(matches.length).toBe(2);
      expect(matches.map((m) => m.field)).toEqual(['tool_input', 'tool_output']);
      expect(matches.every((m) => m.itemId === 'tool-2')).toBe(true);
    });
  });

  describe('Snippet & Match Coordinates', () => {
    it('accurately generates context snippets containing the query', () => {
      const matches = searchTimeline(sampleTimeline, 'vulnerabilities', allFilters);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.preview.toLowerCase()).toContain('vulnerabilities');
    });

    it('assigns contiguous, zero-based matchIndex across sequential search results', () => {
      const matches = searchTimeline(sampleTimeline, 'auth', allFilters);
      expect(matches.length).toBeGreaterThan(1);
      matches.forEach((m, idx) => {
        expect(m.matchIndex).toBe(idx);
      });
    });

    it('adds ellipsis prefix or suffix when snippet is extracted from within longer text', () => {
      const longTextItem: TimelineItem = {
        id: 'long-0',
        type: 'user_input',
        stepIndex: 0,
        createdAt: '2026-10-31T10:00:00Z',
        content:
          'A'.repeat(80) + ' TARGET_KEYWORD ' + 'Z'.repeat(80),
      };
      const matches = searchTimeline([longTextItem], 'TARGET_KEYWORD', allFilters);
      expect(matches.length).toBe(1);
      const m0 = matches[0]!;
      expect(m0.preview.startsWith('...')).toBe(true);
      expect(m0.preview.endsWith('...')).toBe(true);
      expect(m0.preview).toContain('TARGET_KEYWORD');
    });
  });
});
