import { describe, it, expect } from 'bun:test';
import { mount } from '@vue/test-utils';
import StatsBar from '../../src/components/StatsBar.vue';

describe('StatsBar Component (StatsBar.vue)', () => {
  const sampleTokens = {
    input: 1200000,
    output: 85000,
    cacheRead: 350000,
    total: 1635000,
  };

  it('renders records, turns and token metrics when total tokens > 0', () => {
    const wrapper = mount(StatsBar, {
      props: {
        recordCount: 42,
        turnCount: 15,
        tokens: sampleTokens,
      },
    });

    expect(wrapper.text()).toContain('42 records');
    expect(wrapper.text()).toContain('15 turns');
    expect(wrapper.text()).toContain('In: 1,200,000');
    expect(wrapper.text()).toContain('Out: 85,000');
    expect(wrapper.text()).toContain('Cached: 350,000');
    expect(wrapper.text()).toContain('Total: 1,635,000');
  });

  it('omits token breakdown when total tokens is 0', () => {
    const wrapper = mount(StatsBar, {
      props: {
        recordCount: 10,
        turnCount: 4,
        tokens: { input: 0, output: 0, cacheRead: 0, total: 0 },
      },
    });

    expect(wrapper.text()).toContain('10 records');
    expect(wrapper.text()).toContain('4 turns');
    expect(wrapper.text()).not.toContain('In:');
    expect(wrapper.text()).not.toContain('Out:');
    expect(wrapper.text()).not.toContain('Total:');
  });

  it('emits close event when close button is clicked', async () => {
    const wrapper = mount(StatsBar, {
      props: {
        recordCount: 10,
        turnCount: 4,
        tokens: sampleTokens,
      },
    });

    const closeBtn = wrapper.find('button[title="Close statistics bar"]');
    expect(closeBtn.exists()).toBe(true);

    await closeBtn.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
