import { describe, it, expect } from 'bun:test';
import { mount } from '@vue/test-utils';
import XmlBubbleView from '../../src/components/XmlBubbleView.vue';

describe('XML Bubble Component (XmlBubbleView.vue)', () => {
  describe('Pill Presentation', () => {
    it('renders <TAG_NAME> pill with character count badge and single-line preview when collapsed', () => {
      const innerContent = 'Line 1: info\nLine 2: details';
      const content = `<ADDITIONAL_METADATA>\n${innerContent}\n</ADDITIONAL_METADATA>`;
      const wrapper = mount(XmlBubbleView, {
        props: {
          content,
        },
      });

      // ADDITIONAL_METADATA is collapsed by default
      expect(wrapper.text()).toContain('<ADDITIONAL_METADATA>');
      expect(wrapper.text()).toContain(`${innerContent.length} chars`);

      // Verify single-line preview text
      expect(wrapper.text()).toContain('Line 1: info Line 2: details');
    });

    it('renders USER_REQUEST expanded by default', () => {
      const content = '<USER_REQUEST>Please solve this problem</USER_REQUEST>';
      const wrapper = mount(XmlBubbleView, {
        props: {
          content,
        },
      });

      expect(wrapper.text()).toContain('<USER_REQUEST>');
      const body = wrapper.find('.markdown-body');
      expect(body.exists()).toBe(true);
      expect(body.isVisible()).toBe(true);
      expect(body.text()).toContain('Please solve this problem');
    });

    it('respects defaultCollapsed prop for custom tags', () => {
      const content = '<CUSTOM_TAG>custom inner text</CUSTOM_TAG>';
      const wrapperCollapsed = mount(XmlBubbleView, {
        props: {
          content,
          defaultCollapsed: true,
        },
      });
      const collapsedContainer = wrapperCollapsed.find('.p-3.bg-\\[var\\(--bg-primary\\)\\]');
      expect((collapsedContainer.element as HTMLElement).style.display).toBe('none');
      expect(wrapperCollapsed.text()).toContain('custom inner text'); // Preview line

      const wrapperExpanded = mount(XmlBubbleView, {
        props: {
          content,
          defaultCollapsed: false,
        },
      });
      const expandedContainer = wrapperExpanded.find('.p-3.bg-\\[var\\(--bg-primary\\)\\]');
      expect((expandedContainer.element as HTMLElement).style.display).not.toBe('none');
    });

    it('initializes collapse state when content updates dynamically', async () => {
      const wrapper = mount(XmlBubbleView, {
        props: {
          content: '<USER_REQUEST>Initial prompt</USER_REQUEST>',
        },
      });

      expect(wrapper.text()).toContain('Initial prompt');

      // Update content dynamically with ADDITIONAL_METADATA (which should default to collapsed)
      await wrapper.setProps({
        content: '<USER_REQUEST>Initial prompt</USER_REQUEST>\n<ADDITIONAL_METADATA>New metadata</ADDITIONAL_METADATA>',
      });

      expect(wrapper.text()).toContain('<ADDITIONAL_METADATA>');
      // Find containers: first is USER_REQUEST (expanded), second is ADDITIONAL_METADATA (collapsed)
      const containers = wrapper.findAll('.p-3.bg-\\[var\\(--bg-primary\\)\\]');
      expect(containers.length).toBe(2);
      expect((containers[0]!.element as HTMLElement).style.display).not.toBe('none');
      expect((containers[1]!.element as HTMLElement).style.display).toBe('none');
    });
  });

  describe('Interaction', () => {
    it('toggles expansion and displays rendered markdown body on header click', async () => {
      const content = '<NOTE>\n# Heading\n- Item 1\n- Item 2\n</NOTE>';
      const wrapper = mount(XmlBubbleView, {
        props: {
          content,
          defaultCollapsed: true,
        },
      });

      const container = wrapper.find('.p-3.bg-\\[var\\(--bg-primary\\)\\]');
      // Initially collapsed
      expect((container.element as HTMLElement).style.display).toBe('none');

      // Click header to expand
      const header = wrapper.find('.cursor-pointer');
      await header.trigger('click');

      // Now expanded with rendered markdown
      expect((container.element as HTMLElement).style.display).not.toBe('none');
      const body = wrapper.find('.markdown-body');
      expect(body.exists()).toBe(true);
      expect(body.html()).toContain('<h1>Heading</h1>');
      expect(body.html()).toContain('<li>Item 1</li>');

      // Click again to collapse
      await header.trigger('click');
      expect((container.element as HTMLElement).style.display).toBe('none');
    });

    it('supports setAllCollapsed exposed method', async () => {
      const content = '<FOO>foo content</FOO>\n<BAR>bar content</BAR>';
      const wrapper = mount(XmlBubbleView, {
        props: {
          content,
          defaultCollapsed: true,
        },
      });

      // Expand all via exposed method
      (wrapper.vm as any).setAllCollapsed(false);
      await wrapper.vm.$nextTick();

      const containers = wrapper.findAll('.p-3.bg-\\[var\\(--bg-primary\\)\\]');
      expect(containers.length).toBe(2);
      for (const c of containers) {
        expect((c.element as HTMLElement).style.display).not.toBe('none');
      }

      // Collapse all
      (wrapper.vm as any).setAllCollapsed(true);
      await wrapper.vm.$nextTick();

      for (const c of containers) {
        expect((c.element as HTMLElement).style.display).toBe('none');
      }
    });
  });

  describe('Nested Bubbles & Mixed Content', () => {
    it('recursively renders child XmlBubbleView components when tags are nested', () => {
      const content =
        '<USER_REQUEST>\nOuter instructions\n<SKILL>\nNested skill definition\n</SKILL>\n</USER_REQUEST>';
      const wrapper = mount(XmlBubbleView, {
        props: {
          content,
        },
      });

      // Outer tag pill
      expect(wrapper.text()).toContain('<USER_REQUEST>');

      // Inner tag pill
      expect(wrapper.text()).toContain('<SKILL>');
      expect(wrapper.text()).toContain('Nested skill definition');

      // Verifies both header pills are present in the DOM
      const headers = wrapper.findAll('.cursor-pointer');
      expect(headers.length).toBe(2);
    });

    it('propagates setAllCollapsed to recursively nested bubbles', async () => {
      const content =
        '<USER_REQUEST>\n<SKILL>\nInner skill\n</SKILL>\n</USER_REQUEST>';
      const wrapper = mount(XmlBubbleView, {
        props: {
          content,
        },
      });

      (wrapper.vm as any).setAllCollapsed(true);
      await wrapper.vm.$nextTick();

      const containers = wrapper.findAll('.p-3.bg-\\[var\\(--bg-primary\\)\\]');
      for (const c of containers) {
        expect((c.element as HTMLElement).style.display).toBe('none');
      }
    });

    it('renders alternating plain text chunks without pill wrapper', () => {
      const content = 'Plain intro text before tag\n<ALERT>Important</ALERT>\nPlain outro text after tag';
      const wrapper = mount(XmlBubbleView, {
        props: {
          content,
        },
      });

      expect(wrapper.text()).toContain('Plain intro text before tag');
      expect(wrapper.text()).toContain('<ALERT>');
      expect(wrapper.text()).toContain('Plain outro text after tag');
    });
  });
});
