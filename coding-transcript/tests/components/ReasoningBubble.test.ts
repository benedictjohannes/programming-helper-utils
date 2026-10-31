import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { mount } from '@vue/test-utils';
import ReasoningBubble from '../../src/components/ReasoningBubble.vue';

describe('Reasoning Bubble Component (ReasoningBubble.vue)', () => {
  it('renders collapsed by default and shows toggle text and character count', () => {
    const wrapper = mount(ReasoningBubble, {
      props: {
        content: 'Analyzing the user query...',
      },
    });

    expect(wrapper.text()).toContain('Reasoning / Thought');
    expect(wrapper.text()).toContain('Show Thinking');
    expect(wrapper.text()).toContain('27 chars');
    expect(wrapper.find('.markdown-body').exists()).toBe(false);
  });

  it('renders expanded by default when defaultExpanded is true', () => {
    const wrapper = mount(ReasoningBubble, {
      props: {
        content: '**Thinking through the architecture**',
        defaultExpanded: true,
      },
    });

    expect(wrapper.text()).toContain('Hide Thinking');
    const md = wrapper.find('.markdown-body');
    expect(md.exists()).toBe(true);
    expect(md.html()).toContain('<strong>Thinking through the architecture</strong>');
  });

  it('toggles expansion when clicking the toggle button or header', async () => {
    const wrapper = mount(ReasoningBubble, {
      props: {
        content: '- Plan step 1\n- Plan step 2',
      },
    });

    expect(wrapper.find('.markdown-body').exists()).toBe(false);

    // Expand via toggle button
    const toggleBtn = wrapper.find('button[type="button"]');
    await toggleBtn.trigger('click');

    expect(wrapper.text()).toContain('Hide Thinking');
    expect(wrapper.find('.markdown-body').exists()).toBe(true);
    expect(wrapper.find('.markdown-body').html()).toContain('<li>Plan step 1</li>');

    // Collapse again
    await toggleBtn.trigger('click');
    expect(wrapper.text()).toContain('Show Thinking');
    expect(wrapper.find('.markdown-body').exists()).toBe(false);
  });

  it('supports custom title prop', () => {
    const wrapper = mount(ReasoningBubble, {
      props: {
        content: 'Custom thought trace',
        title: 'Model Internal Monologue',
      },
    });

    expect(wrapper.text()).toContain('Model Internal Monologue');
  });

  it('handles copy action gracefully when clipboard API is unavailable', async () => {
    const wrapper = mount(ReasoningBubble, {
      props: {
        content: 'Secret plan',
        defaultExpanded: true,
      },
    });

    const copyBtn = wrapper.findAll('button').find((b) => b.text().includes('Copy'));
    expect(copyBtn).toBeDefined();
    await copyBtn!.trigger('click');
    // Does not crash
  });
});
