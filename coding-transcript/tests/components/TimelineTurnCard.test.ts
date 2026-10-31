import { describe, it, expect } from 'bun:test';
import { mount } from '@vue/test-utils';
import TimelineTurnCard from '../../src/components/TimelineTurnCard.vue';
import XmlBubbleView from '../../src/components/XmlBubbleView.vue';
import ToolCallsList from '../../src/components/ToolCallsList.vue';
import type { TimelineItem } from '../../src/types';

describe('Turn Card Component (TimelineTurnCard.vue)', () => {
  describe('Role Rendering', () => {
    it('renders User badge and styling for user_input', () => {
      const item: TimelineItem = {
        id: 'turn-1',
        type: 'user_input',
        stepIndex: 1,
        createdAt: '2026-10-31T10:00:00Z',
        content: 'Please refactor the code',
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      expect(wrapper.find('#turn-1').exists()).toBe(true);
      expect(wrapper.text()).toContain('User');
      expect(wrapper.text()).toContain('#1');
    });

    it('renders Assistant badge for model_response', () => {
      const item: TimelineItem = {
        id: 'turn-2',
        type: 'model_response',
        stepIndex: 2,
        createdAt: '2026-10-31T10:01:00Z',
        content: 'Sure, here is the refactored code.',
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      expect(wrapper.text()).toContain('Assistant');
      expect(wrapper.text()).toContain('#2');
    });

    it('renders Tool Calls badge for tool_call', () => {
      const item: TimelineItem = {
        id: 'turn-3',
        type: 'tool_call',
        stepIndex: 3,
        createdAt: '2026-10-31T10:02:00Z',
        tools: [
          {
            id: 'call-1',
            name: 'run_command',
            args: { CommandLine: 'ls' },
            summaryText: 'List files',
            status: 'DONE',
            stepIndexCall: 3,
            stepIndexResult: 4,
            createdAt: '2026-10-31T10:02:00Z',
          },
        ],
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      expect(wrapper.text()).toContain('Tool Calls');
      expect(wrapper.text()).toContain('#3');
    });

    it('renders System badge for system_message', () => {
      const item: TimelineItem = {
        id: 'turn-4',
        type: 'system_message',
        stepIndex: 0,
        createdAt: '2026-10-31T09:59:00Z',
        content: 'System initialized.',
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      expect(wrapper.text()).toContain('System');
      expect(wrapper.text()).toContain('#0');
      expect(wrapper.text()).toContain('System initialized.');
    });
  });

  describe('Collapsibility', () => {
    it('is expanded by default and displays full body and token metrics', () => {
      const item: TimelineItem = {
        id: 'turn-collapsible',
        type: 'model_response',
        stepIndex: 5,
        createdAt: '2026-10-31T10:05:00Z',
        content: 'Detailed explanation text goes here.',
        tokens: {
          input: 1250,
          output: 450,
          cacheRead: 200,
        },
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      const body = wrapper.find('.bg-\\[var\\(--bg-primary\\)\\]');
      expect(body.exists()).toBe(true);
      expect((body.element as HTMLElement).style.display).not.toBe('none');
      expect(wrapper.text()).toContain('in: 1,250');
      expect(wrapper.text()).toContain('out: 450');
      expect(wrapper.text()).toContain('cache: 200');
    });

    it('collapses into summary when header is clicked', async () => {
      const item: TimelineItem = {
        id: 'turn-toggle',
        type: 'user_input',
        stepIndex: 6,
        createdAt: '2026-10-31T10:06:00Z',
        content: 'First line of request\nSecond line of request',
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      const header = wrapper.find('.cursor-pointer');
      await header.trigger('click');

      const body = wrapper.find('.bg-\\[var\\(--bg-primary\\)\\]');
      expect((body.element as HTMLElement).style.display).toBe('none');
      // Collapsed preview summary is present
      expect(wrapper.text()).toContain('First line of request Second line of request');

      // Click again to expand
      await header.trigger('click');
      expect((body.element as HTMLElement).style.display).not.toBe('none');
    });

    it('supports programmatically setting collapsed state via exposed setTurnCollapsed', async () => {
      const item: TimelineItem = {
        id: 'turn-exposed',
        type: 'user_input',
        stepIndex: 7,
        createdAt: '2026-10-31T10:07:00Z',
        content: 'Some message',
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      (wrapper.vm as any).setTurnCollapsed(true);
      await wrapper.vm.$nextTick();

      const body = wrapper.find('.bg-\\[var\\(--bg-primary\\)\\]');
      expect((body.element as HTMLElement).style.display).toBe('none');

      (wrapper.vm as any).setTurnCollapsed(false);
      await wrapper.vm.$nextTick();
      expect((body.element as HTMLElement).style.display).not.toBe('none');
    });
  });

  describe('Nested Child Components & Content', () => {
    it('renders XmlBubbleView when XML tags are detected in user prompts', () => {
      const item: TimelineItem = {
        id: 'turn-xml',
        type: 'user_input',
        stepIndex: 8,
        createdAt: '2026-10-31T10:08:00Z',
        content: '<USER_REQUEST>Fix the bugs</USER_REQUEST>',
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      const xmlBubble = wrapper.findComponent(XmlBubbleView);
      expect(xmlBubble.exists()).toBe(true);
      expect(wrapper.text()).toContain('<USER_REQUEST>');
    });

    it('renders ToolCallsList when tools are present in tool_call turns', async () => {
      const item: TimelineItem = {
        id: 'turn-tools',
        type: 'tool_call',
        stepIndex: 9,
        createdAt: '2026-10-31T10:09:00Z',
        tools: [
          {
            id: 'call-a',
            name: 'read_file',
            args: { Path: 'src/main.ts' },
            summaryText: 'Read main.ts',
            status: 'DONE',
            stepIndexCall: 9,
            stepIndexResult: 10,
            createdAt: '2026-10-31T10:09:00Z',
          },
          {
            id: 'call-b',
            name: 'run_command',
            args: { CommandLine: 'bun test' },
            summaryText: 'Run tests',
            status: 'ERROR',
            stepIndexCall: 9,
            stepIndexResult: 11,
            createdAt: '2026-10-31T10:09:01Z',
          },
        ],
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      expect(wrapper.text()).toContain('2 tool calls');
      const toolCallsList = wrapper.findComponent(ToolCallsList);
      expect(toolCallsList.exists()).toBe(true);
      expect(wrapper.text()).toContain('read_file');
      expect(wrapper.text()).toContain('run_command');

      // Calling expandTool on TimelineTurnCard expands the specific tool call inside ToolCallsList
      (wrapper.vm as any).expandTool('call-a');
      await wrapper.vm.$nextTick();
      expect((toolCallsList.vm as any).expandedMap['call-a']).toBe(true);
    });

    it('renders Markdown content through the markdown renderer on model responses', () => {
      const item: TimelineItem = {
        id: 'turn-md',
        type: 'model_response',
        stepIndex: 10,
        createdAt: '2026-10-31T10:10:00Z',
        content: '**Bold Statement** and `inline code`',
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      const markdownBody = wrapper.find('.markdown-body');
      expect(markdownBody.exists()).toBe(true);
      expect(markdownBody.html()).toContain('<strong>Bold Statement</strong>');
      expect(markdownBody.html()).toContain('<code>inline code</code>');
    });

    it('renders Markdown content on system messages when no XML tags are present', () => {
      const item: TimelineItem = {
        id: 'turn-system-md',
        type: 'system_message',
        stepIndex: 10,
        createdAt: '2026-10-31T10:10:00Z',
        content: '### System Policy\n- Item 1\n- Item 2\n`code_snippet`',
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      const markdownBody = wrapper.find('.markdown-body');
      expect(markdownBody.exists()).toBe(true);
      expect(markdownBody.html()).toContain('<h3>System Policy</h3>');
      expect(markdownBody.html()).toContain('<li>Item 1</li>');
      expect(markdownBody.html()).toContain('<code>code_snippet</code>');
    });

    it('renders thinking dropdown and toggles thinking content on model turns', async () => {
      const item: TimelineItem = {
        id: 'turn-thinking',
        type: 'model_response',
        stepIndex: 11,
        createdAt: '2026-10-31T10:11:00Z',
        thinking: 'I need to inspect the code before making edits.',
        content: 'All set.',
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      expect(wrapper.text()).toContain('Show Thinking');
      expect(wrapper.text()).not.toContain('I need to inspect the code before making edits.');

      // Click to toggle thinking
      const thinkingBtn = wrapper.find('button');
      await thinkingBtn.trigger('click');

      expect(wrapper.text()).toContain('Hide Thinking');
      expect(wrapper.text()).toContain('I need to inspect the code before making edits.');
    });

    it('renders attached media when present on user_input turns', () => {
      const item: TimelineItem = {
        id: 'turn-media',
        type: 'user_input',
        stepIndex: 12,
        createdAt: '2026-10-31T10:12:00Z',
        content: 'Look at this screenshot',
        media: [
          {
            mime_type: 'image/png',
            uri: 'file:///tmp/screenshot.png',
          },
        ],
      };
      const wrapper = mount(TimelineTurnCard, { props: { item } });

      expect(wrapper.text()).toContain('Attached Media');
      expect(wrapper.text()).toContain('image/png: file:///tmp/screenshot.png');
    });
  });
});
