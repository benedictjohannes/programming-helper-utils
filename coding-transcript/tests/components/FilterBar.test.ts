import { describe, it, expect } from 'bun:test';
import { mount } from '@vue/test-utils';
import FilterBar from '../../src/components/FilterBar.vue';

describe('FilterBar Component (FilterBar.vue)', () => {
  const defaultFilters = {
    user: true,
    assistant: true,
    tool: true,
    reasoning: true,
    system: true,
  };

  const defaultCounts = {
    user: 5,
    assistant: 6,
    tool: 12,
    reasoning: 6,
    system: 1,
  };

  it('renders all filter buttons with counts and icons', () => {
    const wrapper = mount(FilterBar, {
      props: {
        filters: defaultFilters,
        counts: defaultCounts,
      },
    });

    expect(wrapper.text()).toContain('User');
    expect(wrapper.text()).toContain('5');
    expect(wrapper.text()).toContain('Assistant');
    expect(wrapper.text()).toContain('6');
    expect(wrapper.text()).toContain('Tools');
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('Reasoning');
    expect(wrapper.text()).toContain('6');
    expect(wrapper.text()).toContain('System');
    expect(wrapper.text()).toContain('1');
  });

  it('hides System button when system count is 0', () => {
    const wrapper = mount(FilterBar, {
      props: {
        filters: defaultFilters,
        counts: { ...defaultCounts, system: 0 },
      },
    });

    expect(wrapper.text()).not.toContain('System');
  });

  it('emits update:filters when a toggle button is clicked', async () => {
    const wrapper = mount(FilterBar, {
      props: {
        filters: defaultFilters,
        counts: defaultCounts,
      },
    });

    const userBtn = wrapper.findAll('button').find((b) => b.text().includes('User'));
    expect(userBtn).toBeDefined();

    await userBtn!.trigger('click');
    expect(wrapper.emitted('update:filters')).toBeTruthy();
    expect(wrapper.emitted('update:filters')![0]).toEqual([{
      ...defaultFilters,
      user: false,
    }]);
  });

  it('applies "Chat only" preset correctly', async () => {
    const wrapper = mount(FilterBar, {
      props: {
        filters: defaultFilters,
        counts: defaultCounts,
      },
    });

    const chatOnlyBtn = wrapper.findAll('button').find((b) => b.text().includes('Chat only'));
    expect(chatOnlyBtn).toBeDefined();

    await chatOnlyBtn!.trigger('click');
    expect(wrapper.emitted('update:filters')).toBeTruthy();
    expect(wrapper.emitted('update:filters')![0]).toEqual([{
      user: true,
      assistant: true,
      system: true,
      tool: false,
      reasoning: false,
    }]);
  });

  it('applies "Tools only" preset correctly', async () => {
    const wrapper = mount(FilterBar, {
      props: {
        filters: defaultFilters,
        counts: defaultCounts,
      },
    });

    const toolsOnlyBtn = wrapper.findAll('button').find((b) => b.text().includes('Tools only'));
    expect(toolsOnlyBtn).toBeDefined();

    await toolsOnlyBtn!.trigger('click');
    expect(wrapper.emitted('update:filters')).toBeTruthy();
    expect(wrapper.emitted('update:filters')![0]).toEqual([{
      user: false,
      assistant: false,
      system: false,
      tool: true,
      reasoning: true,
    }]);
  });

  it('applies "All" preset correctly', async () => {
    const wrapper = mount(FilterBar, {
      props: {
        filters: {
          user: false,
          assistant: false,
          tool: false,
          reasoning: false,
          system: false,
        },
        counts: defaultCounts,
      },
    });

    const allBtn = wrapper.findAll('button').find((b) => b.text().includes('All'));
    expect(allBtn).toBeDefined();

    await allBtn!.trigger('click');
    expect(wrapper.emitted('update:filters')).toBeTruthy();
    expect(wrapper.emitted('update:filters')![0]).toEqual([defaultFilters]);
  });

  it('emits close event when close button is clicked', async () => {
    const wrapper = mount(FilterBar, {
      props: {
        filters: defaultFilters,
        counts: defaultCounts,
      },
    });

    const closeBtn = wrapper.find('button[title="Close filter bar"]');
    expect(closeBtn.exists()).toBe(true);

    await closeBtn.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
