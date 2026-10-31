import { describe, it, expect, beforeEach } from 'bun:test';
import { mount } from '@vue/test-utils';
import App from '../../src/App.vue';
import UploadView from '../../src/components/UploadView.vue';
import SearchBar from '../../src/components/SearchBar.vue';
import TimelineTurnCard from '../../src/components/TimelineTurnCard.vue';
import ToolCallsList from '../../src/components/ToolCallsList.vue';

const sampleAntigravityJsonl = `{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","created_at":"2026-10-31T10:00:00Z","content":"<USER_REQUEST>Build feature A</USER_REQUEST>"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","created_at":"2026-10-31T10:01:00Z","content":"I will inspect the workspace","thinking":"Check directory","tool_calls":[{"name":"run_command","args":{"CommandLine":"ls"}}]}
{"step_index":2,"source":"GENERIC","type":"GENERIC","status":"DONE","created_at":"2026-10-31T10:01:05Z","content":"file1.txt\nfile2.txt"}`;

describe('Application Layout & Global Orchestration (App.vue)', () => {
  beforeEach(() => {
    document.documentElement.className = '';
  });

  describe('View Transitions', () => {
    it('shows UploadView on initial mount when timeline is empty', () => {
      const wrapper = mount(App);

      expect(wrapper.findComponent(UploadView).exists()).toBe(true);
      expect(wrapper.findComponent(SearchBar).exists()).toBe(false);
      expect(wrapper.findAllComponents(TimelineTurnCard).length).toBe(0);
    });

    it('switches from UploadView to timeline view upon successful transcript load', async () => {
      const wrapper = mount(App);

      const uploadView = wrapper.findComponent(UploadView);
      expect(uploadView.exists()).toBe(true);

      // Emit load event from UploadView
      await uploadView.vm.$emit('load', sampleAntigravityJsonl, 'test.jsonl', 'antigravity');
      await wrapper.vm.$nextTick();

      // UploadView should be unmounted, replaced with SearchBar and TimelineTurnCard components
      expect(wrapper.findComponent(UploadView).exists()).toBe(false);
      expect(wrapper.findComponent(SearchBar).exists()).toBe(true);

      const cards = wrapper.findAllComponents(TimelineTurnCard);
      expect(cards.length).toBeGreaterThan(0);

      // Top navbar displays stats and filename
      expect(wrapper.text()).toContain('test.jsonl');
      expect(wrapper.text()).toContain('records');
      expect(wrapper.text()).toContain('turns');
    });

    it('returns to UploadView when clicking the Open button to load another file', async () => {
      const wrapper = mount(App);

      const uploadView = wrapper.findComponent(UploadView);
      await uploadView.vm.$emit('load', sampleAntigravityJsonl, 'test.jsonl');
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent(UploadView).exists()).toBe(false);

      // Find the Open button in navbar
      const buttons = wrapper.findAll('header button');
      const openButton = buttons.find((b) => b.text().includes('Open'));
      expect(openButton).toBeDefined();

      await openButton!.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent(UploadView).exists()).toBe(true);
      expect(wrapper.findComponent(SearchBar).exists()).toBe(false);
    });

    it('expands target tool call when searching for a query within tool inputs', async () => {
      const wrapper = mount(App);

      const uploadView = wrapper.findComponent(UploadView);
      await uploadView.vm.$emit('load', sampleAntigravityJsonl, 'test.jsonl');
      await wrapper.vm.$nextTick();

      const searchBar = wrapper.findComponent(SearchBar);
      expect(searchBar.exists()).toBe(true);

      // Search for "ls" which is inside the tool call args
      await searchBar.vm.$emit('update:modelValue', 'ls');
      await wrapper.vm.$nextTick();

      const cards = wrapper.findAllComponents(TimelineTurnCard);
      const toolTurnCard = cards.find((c) => (c.vm as any).item?.type === 'tool_call');
      expect(toolTurnCard).toBeDefined();

      const toolList = toolTurnCard!.findComponent(ToolCallsList);
      expect(toolList.exists()).toBe(true);

      const toolId = (toolTurnCard!.vm as any).item.tools[0].id;
      expect((toolList.vm as any).expandedMap[toolId]).toBe(true);
    });
  });

  describe('Global Cascade (Collapse all / Expand all)', () => {
    it('collapses all turns when clicking Collapse all and restores when clicking Expand all', async () => {
      const wrapper = mount(App);

      const uploadView = wrapper.findComponent(UploadView);
      await uploadView.vm.$emit('load', sampleAntigravityJsonl, 'test.jsonl');
      await wrapper.vm.$nextTick();

      const cards = wrapper.findAllComponents(TimelineTurnCard);
      expect(cards.length).toBeGreaterThan(0);

      // Initially cards are expanded
      for (const card of cards) {
        expect((card.vm as any).isTurnCollapsed).toBe(false);
      }

      // Click "Collapse all" button in header
      const headerButtons = wrapper.findAll('header button');
      const collapseAllBtn = headerButtons.find((b) => b.text().includes('Collapse all'));
      expect(collapseAllBtn).toBeDefined();

      await collapseAllBtn!.trigger('click');
      await wrapper.vm.$nextTick();

      for (const card of cards) {
        expect((card.vm as any).isTurnCollapsed).toBe(true);
      }

      // Click "Expand all" button in header
      const expandAllBtn = headerButtons.find((b) => b.text().includes('Expand all'));
      expect(expandAllBtn).toBeDefined();

      await expandAllBtn!.trigger('click');
      await wrapper.vm.$nextTick();

      for (const card of cards) {
        expect((card.vm as any).isTurnCollapsed).toBe(false);
      }
    });
  });

  describe('Theme Toggling', () => {
    it('toggles dark mode class on document.documentElement', async () => {
      const wrapper = mount(App);

      const initialIsDark = document.documentElement.classList.contains('dark');

      // Find theme toggle button (has title containing "Mode")
      const themeBtn = wrapper.find('header button[title*="Mode"]');
      expect(themeBtn.exists()).toBe(true);

      await themeBtn.trigger('click');
      expect(document.documentElement.classList.contains('dark')).toBe(!initialIsDark);

      await themeBtn.trigger('click');
      expect(document.documentElement.classList.contains('dark')).toBe(initialIsDark);
    });
  });
});
