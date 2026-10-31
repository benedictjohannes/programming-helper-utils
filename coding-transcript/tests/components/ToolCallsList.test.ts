import { describe, it, expect } from 'bun:test';
import { mount } from '@vue/test-utils';
import ToolCallsList from '../../src/components/ToolCallsList.vue';
import type { ToolCallItem } from '../../src/types';

describe('Tool Calls List Component (ToolCallsList.vue)', () => {
  const sampleTools: ToolCallItem[] = [
    {
      id: 'tool-done-1',
      name: 'run_command',
      args: { CommandLine: 'bun run build' },
      summaryText: 'Run build command',
      status: 'DONE',
      stepIndexCall: 5,
      stepIndexResult: 6,
      createdAt: '2026-10-31T10:00:00Z',
      outputContent: 'Build completed in 300ms',
    },
    {
      id: 'tool-err-1',
      name: 'read_file',
      args: { Path: '/nonexistent/file.ts' },
      summaryText: 'Read file.ts',
      status: 'ERROR',
      stepIndexCall: 7,
      stepIndexResult: 8,
      createdAt: '2026-10-31T10:01:00Z',
      outputContent: 'Error: ENOENT no such file or directory',
    },
  ];

  describe('Tool Header & Status', () => {
    it('renders tool identifier, status badge (DONE / ERROR), and concise summary line', () => {
      const wrapper = mount(ToolCallsList, {
        props: { tools: sampleTools },
      });

      // Headers for both tools
      expect(wrapper.text()).toContain('run_command');
      expect(wrapper.text()).toContain('Run build command');
      expect(wrapper.text()).toContain('DONE');
      expect(wrapper.text()).toContain('#5');

      expect(wrapper.text()).toContain('read_file');
      expect(wrapper.text()).toContain('Read file.ts');
      expect(wrapper.text()).toContain('ERROR');
      expect(wrapper.text()).toContain('#7');
    });

    it('auto-expands tool calls that have status ERROR while leaving DONE collapsed by default', () => {
      const wrapper = mount(ToolCallsList, {
        props: { tools: sampleTools },
      });

      const bodies = wrapper.findAll('.p-3.space-y-3.bg-\\[var\\(--bg-primary\\)\\]');
      expect(bodies.length).toBe(2);

      // Tool 1 (DONE) is collapsed by default
      expect((bodies[0]!.element as HTMLElement).style.display).toBe('none');

      // Tool 2 (ERROR) is auto-expanded by default
      expect((bodies[1]!.element as HTMLElement).style.display).not.toBe('none');
      expect(wrapper.text()).toContain('Error: ENOENT no such file or directory');
    });

    it('toggles tool expansion on header click', async () => {
      const wrapper = mount(ToolCallsList, {
        props: { tools: sampleTools },
      });

      const headers = wrapper.findAll('.cursor-pointer');
      const body0 = wrapper.findAll('.p-3.space-y-3.bg-\\[var\\(--bg-primary\\)\\]')[0]!;

      // Initially collapsed
      expect((body0.element as HTMLElement).style.display).toBe('none');

      // Click to expand tool 1
      await headers[0]!.trigger('click');
      expect((body0.element as HTMLElement).style.display).not.toBe('none');
      expect(wrapper.text()).toContain('Build completed in 300ms');

      // Click again to collapse tool 1
      await headers[0]!.trigger('click');
      expect((body0.element as HTMLElement).style.display).toBe('none');
    });

    it('supports setAllExpanded exposed method', async () => {
      const wrapper = mount(ToolCallsList, {
        props: { tools: sampleTools },
      });

      (wrapper.vm as any).setAllExpanded(true);
      await wrapper.vm.$nextTick();

      const bodies = wrapper.findAll('.p-3.space-y-3.bg-\\[var\\(--bg-primary\\)\\]');
      expect((bodies[0]!.element as HTMLElement).style.display).not.toBe('none');
      expect((bodies[1]!.element as HTMLElement).style.display).not.toBe('none');

      (wrapper.vm as any).setAllExpanded(false);
      await wrapper.vm.$nextTick();

      expect((bodies[0]!.element as HTMLElement).style.display).toBe('none');
      expect((bodies[1]!.element as HTMLElement).style.display).toBe('none');
    });

    it('supports setToolExpanded to expand a single targeted tool call', async () => {
      const wrapper = mount(ToolCallsList, {
        props: { tools: sampleTools },
      });

      // Initially tool 0 (DONE) is collapsed
      const bodies = wrapper.findAll('.p-3.space-y-3.bg-\\[var\\(--bg-primary\\)\\]');
      expect((bodies[0]!.element as HTMLElement).style.display).toBe('none');

      (wrapper.vm as any).setToolExpanded('tool-done-1', true);
      await wrapper.vm.$nextTick();

      expect((bodies[0]!.element as HTMLElement).style.display).not.toBe('none');
    });
  });

  describe('Diff Presentation for File Edits', () => {
    it('formats side-by-side diff view with Target (Replaced) and Replacement for edit_file', () => {
      const editTools: ToolCallItem[] = [
        {
          id: 'tool-edit-1',
          name: 'edit_file',
          args: {
            Path: 'src/utils/calc.ts',
            Target: 'function add(a, b) {\n  return a - b;\n}',
            Replacement: 'function add(a, b) {\n  return a + b;\n}',
          },
          summaryText: 'Fix add function',
          status: 'DONE',
          stepIndexCall: 10,
          createdAt: '2026-10-31T10:05:00Z',
        },
      ];

      const wrapper = mount(ToolCallsList, {
        props: { tools: editTools },
      });

      // Expand the tool
      (wrapper.vm as any).setAllExpanded(true);

      expect(wrapper.text()).toContain('File: src/utils/calc.ts');
      expect(wrapper.text()).toContain('Target (Replaced)');
      expect(wrapper.text()).toContain('function add(a, b) {\n  return a - b;\n}');
      expect(wrapper.text()).toContain('Replacement');
      expect(wrapper.text()).toContain('function add(a, b) {\n  return a + b;\n}');
    });

    it('displays (Deleted) when edit_file replacement is empty string', () => {
      const editTools: ToolCallItem[] = [
        {
          id: 'tool-edit-del',
          name: 'edit_file',
          args: {
            Path: 'src/deprecated.ts',
            Target: 'export const oldVal = 123;\n',
            Replacement: '',
          },
          summaryText: 'Remove deprecated export',
          status: 'DONE',
          stepIndexCall: 11,
          createdAt: '2026-10-31T10:06:00Z',
        },
      ];

      const wrapper = mount(ToolCallsList, {
        props: { tools: editTools },
      });

      (wrapper.vm as any).setAllExpanded(true);

      expect(wrapper.text()).toContain('Target (Replaced)');
      expect(wrapper.text()).toContain('(Deleted)');
    });

    it('formats normalized fileOperation with type: "write" showing content written block', () => {
      const writeTools: ToolCallItem[] = [
        {
          id: 'tool-write-norm',
          name: 'write_file',
          args: { Path: 'docs/guide.md', Content: '# Universal Guide\nWelcome!' },
          fileOperation: {
            type: 'write',
            path: 'docs/guide.md',
            content: '# Universal Guide\nWelcome!',
          },
          summaryText: 'Write docs/guide.md',
          status: 'DONE',
          stepIndexCall: 12,
          createdAt: '2026-10-31T10:07:00Z',
        },
      ];

      const wrapper = mount(ToolCallsList, {
        props: { tools: writeTools },
      });

      (wrapper.vm as any).setAllExpanded(true);

      expect(wrapper.text()).toContain('File: docs/guide.md');
      expect(wrapper.text()).toContain('Content Written');
      expect(wrapper.text()).toContain('# Universal Guide\nWelcome!');
    });

    it('formats normalized fileOperation with type: "edit" and unified diffText (e.g. OpenCode patch)', () => {
      const patchTools: ToolCallItem[] = [
        {
          id: 'tool-patch-norm',
          name: 'patch',
          args: { patchText: '*** Update File: src/app.ts\n@@\n-old line\n+new line' },
          fileOperation: {
            type: 'edit',
            path: 'src/app.ts',
            diffText: '*** Update File: src/app.ts\n@@\n-old line\n+new line',
          },
          summaryText: 'Patch src/app.ts',
          status: 'DONE',
          stepIndexCall: 13,
          createdAt: '2026-10-31T10:08:00Z',
        },
      ];

      const wrapper = mount(ToolCallsList, {
        props: { tools: patchTools },
      });

      (wrapper.vm as any).setAllExpanded(true);

      expect(wrapper.text()).toContain('File: src/app.ts');
      expect(wrapper.text()).toContain('*** Update File: src/app.ts');
      expect(wrapper.text()).toContain('-old line');
      expect(wrapper.text()).toContain('+new line');
    });
  });

  describe('Output Inspection & Specialized Formats', () => {
    it('displays command line formatted with $ prefix for run_command', () => {
      const cmdTools: ToolCallItem[] = [
        {
          id: 'tool-cmd',
          name: 'run_command',
          args: { CommandLine: 'git status' },
          summaryText: 'Check git status',
          status: 'DONE',
          stepIndexCall: 12,
          stepIndexResult: 13,
          createdAt: '2026-10-31T10:07:00Z',
          outputContent: 'On branch main\nnothing to commit',
        },
      ];

      const wrapper = mount(ToolCallsList, {
        props: { tools: cmdTools },
      });

      (wrapper.vm as any).setAllExpanded(true);

      expect(wrapper.text()).toContain('$');
      expect(wrapper.text()).toContain('git status');
      expect(wrapper.text()).toContain('On branch main');
      expect(wrapper.text()).toContain('step #13');
    });

    it('renders reasoning block when tool has thinking text', () => {
      const toolWithThinking: ToolCallItem[] = [
        {
          id: 'tool-think',
          name: 'read_file',
          args: { Path: 'config.json' },
          summaryText: 'Read config',
          status: 'DONE',
          stepIndexCall: 14,
          createdAt: '2026-10-31T10:08:00Z',
          thinking: 'Need to inspect configuration settings first',
        },
      ];

      const wrapper = mount(ToolCallsList, {
        props: { tools: toolWithThinking },
      });

      (wrapper.vm as any).setAllExpanded(true);

      expect(wrapper.text()).toContain('Reasoning / Thought');
      expect(wrapper.text()).toContain('Need to inspect configuration settings first');
    });

    it('displays (Empty output) when outputContent is an empty string', () => {
      const emptyOutTools: ToolCallItem[] = [
        {
          id: 'tool-empty-out',
          name: 'run_command',
          args: { CommandLine: 'mkdir -p foo' },
          summaryText: 'Create dir',
          status: 'DONE',
          stepIndexCall: 15,
          createdAt: '2026-10-31T10:09:00Z',
          outputContent: '',
        },
      ];

      const wrapper = mount(ToolCallsList, {
        props: { tools: emptyOutTools },
      });

      (wrapper.vm as any).setAllExpanded(true);

      expect(wrapper.text()).toContain('(Empty output)');
    });

    it('alerts user with insecure protocol message when copying fails', async () => {
      let alertMessage = '';
      const originalAlert = globalThis.alert;
      globalThis.alert = (msg?: any) => {
        alertMessage = String(msg || '');
      };

      const originalConsoleError = console.error;
      console.error = () => {};

      // Temporarily mock navigator.clipboard to throw
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: () => Promise.reject(new Error('Permission denied')),
        },
        configurable: true,
      });

      const wrapper = mount(ToolCallsList, {
        props: { tools: sampleTools },
      });

      (wrapper.vm as any).setAllExpanded(true);
      await wrapper.vm.$nextTick();

      const copyBtn = wrapper.find('button');
      await copyBtn.trigger('click');

      expect(alertMessage).toContain(
        'Copy failed, this is an irrecoverable error most likely caused by accessing through insecure http:// protocol'
      );

      // Restore
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true,
      });
      globalThis.alert = originalAlert;
      console.error = originalConsoleError;
    });
  });
});
