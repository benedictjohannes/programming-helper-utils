import { describe, it, expect, beforeEach } from 'bun:test';
import { mount } from '@vue/test-utils';
import App from '../../src/App.vue';
import UploadView from '../../src/components/UploadView.vue';
import SearchBar from '../../src/components/SearchBar.vue';
import FilterBar from '../../src/components/FilterBar.vue';
import StatsBar from '../../src/components/StatsBar.vue';
import TimelineTurnCard from '../../src/components/TimelineTurnCard.vue';
import ToolCallsList from '../../src/components/ToolCallsList.vue';

const sampleAntigravityJsonl = `{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","created_at":"2026-10-31T10:00:00Z","content":"<USER_REQUEST>Build feature A</USER_REQUEST>"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","created_at":"2026-10-31T10:01:00Z","content":"I will inspect the workspace","thinking":"Check directory","tool_calls":[{"name":"run_command","args":{"CommandLine":"ls"}}]}
{"step_index":2,"source":"GENERIC","type":"GENERIC","status":"DONE","created_at":"2026-10-31T10:01:05Z","content":"file1.txt\nfile2.txt"}`;

describe('Application Layout & Global Orchestration (App.vue)', () => {
  beforeEach(() => {
    document.documentElement.className = '';
  });

  describe('View Transitions & TopNavBar', () => {
    it('shows UploadView on initial mount when timeline is empty', () => {
      const wrapper = mount(App);

      expect(wrapper.findComponent(UploadView).exists()).toBe(true);
      expect(wrapper.findComponent(SearchBar).exists()).toBe(false);
      expect(wrapper.findComponent(StatsBar).exists()).toBe(false);
      expect(wrapper.findComponent(FilterBar).exists()).toBe(false);
      expect(wrapper.findAllComponents(TimelineTurnCard).length).toBe(0);
    });

    it('switches from UploadView to timeline view and displays StatsBar on load', async () => {
      const wrapper = mount(App);

      const uploadView = wrapper.findComponent(UploadView);
      expect(uploadView.exists()).toBe(true);

      // Emit load event from UploadView
      await uploadView.vm.$emit('load', sampleAntigravityJsonl, 'test.jsonl', 'antigravity');
      await wrapper.vm.$nextTick();

      // UploadView should be unmounted
      expect(wrapper.findComponent(UploadView).exists()).toBe(false);

      // By default on desktop viewport, StatsBar is shown
      expect(wrapper.findComponent(StatsBar).exists()).toBe(true);
      expect(wrapper.findComponent(SearchBar).exists()).toBe(false);

      const cards = wrapper.findAllComponents(TimelineTurnCard);
      expect(cards.length).toBeGreaterThan(0);

      // Top navbar displays filename
      expect(wrapper.text()).toContain('test.jsonl');
      // Stats bar displays records and turns
      expect(wrapper.text()).toContain('records');
      expect(wrapper.text()).toContain('turns');
    });

    it('switches between mutually exclusive secondary bars (Search, Filter, Stats)', async () => {
      const wrapper = mount(App);
      const uploadView = wrapper.findComponent(UploadView);
      await uploadView.vm.$emit('load', sampleAntigravityJsonl, 'test.jsonl');
      await wrapper.vm.$nextTick();

      // Initially StatsBar is visible
      expect(wrapper.findComponent(StatsBar).exists()).toBe(true);
      expect(wrapper.findComponent(SearchBar).exists()).toBe(false);
      expect(wrapper.findComponent(FilterBar).exists()).toBe(false);

      // Click Search icon button
      const searchBtn = wrapper.find('header button[title*="Search transcript"]');
      expect(searchBtn.exists()).toBe(true);
      await searchBtn.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent(SearchBar).exists()).toBe(true);
      expect(wrapper.findComponent(StatsBar).exists()).toBe(false);
      expect(wrapper.findComponent(FilterBar).exists()).toBe(false);

      // Click Filter icon button
      const filterBtn = wrapper.find('header button[title*="Filter visible elements"]');
      expect(filterBtn.exists()).toBe(true);
      await filterBtn.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent(FilterBar).exists()).toBe(true);
      expect(wrapper.findComponent(SearchBar).exists()).toBe(false);
      expect(wrapper.findComponent(StatsBar).exists()).toBe(false);

      // Clicking active Filter button again toggles it off (null)
      await filterBtn.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent(FilterBar).exists()).toBe(false);
      expect(wrapper.findComponent(SearchBar).exists()).toBe(false);
      expect(wrapper.findComponent(StatsBar).exists()).toBe(false);
    });

    it('returns to UploadView when clicking the Close button to unload file', async () => {
      const wrapper = mount(App);

      const uploadView = wrapper.findComponent(UploadView);
      await uploadView.vm.$emit('load', sampleAntigravityJsonl, 'test.jsonl');
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent(UploadView).exists()).toBe(false);

      // Find the Close button in navbar (title contains "Close transcript")
      const closeButton = wrapper.find('header button[title*="Close transcript"]');
      expect(closeButton.exists()).toBe(true);

      await closeButton.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.findComponent(UploadView).exists()).toBe(true);
      expect(wrapper.findComponent(SearchBar).exists()).toBe(false);
      expect(wrapper.findComponent(StatsBar).exists()).toBe(false);
    });

    it('expands target tool call when searching for a query within tool inputs', async () => {
      const wrapper = mount(App);

      const uploadView = wrapper.findComponent(UploadView);
      await uploadView.vm.$emit('load', sampleAntigravityJsonl, 'test.jsonl');
      await wrapper.vm.$nextTick();

      // Open SearchBar
      const searchBtn = wrapper.find('header button[title*="Search transcript"]');
      await searchBtn.trigger('click');
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

  describe('Timeline Display Filtering', () => {
    it('selectively hides turns when filters are toggled', async () => {
      const wrapper = mount(App);
      const uploadView = wrapper.findComponent(UploadView);
      await uploadView.vm.$emit('load', sampleAntigravityJsonl, 'test.jsonl');
      await wrapper.vm.$nextTick();

      const initialCount = wrapper.findAllComponents(TimelineTurnCard).length;
      expect(initialCount).toBe(2); // user turn + tool turn

      // Open FilterBar
      const filterBtn = wrapper.find('header button[title*="Filter visible elements"]');
      await filterBtn.trigger('click');
      await wrapper.vm.$nextTick();

      const filterBar = wrapper.findComponent(FilterBar);
      expect(filterBar.exists()).toBe(true);

      // Hide user turns
      await filterBar.vm.$emit('update:filters', {
        user: false,
        assistant: true,
        tool: true,
        reasoning: true,
        system: true,
      });
      await wrapper.vm.$nextTick();

      const filteredCards = wrapper.findAllComponents(TimelineTurnCard);
      expect(filteredCards.length).toBe(1);
      expect((filteredCards[0]!.vm as any).item.type).toBe('tool_call');

      // Click "Tools only" preset
      const toolsOnlyBtn = filterBar.findAll('button').find(b => b.text().includes('Tools only'));
      expect(toolsOnlyBtn).toBeDefined();
      await toolsOnlyBtn!.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.findAllComponents(TimelineTurnCard).length).toBe(1);

      // Click "All" preset to restore
      const allBtn = filterBar.findAll('button').find(b => b.text().includes('All'));
      expect(allBtn).toBeDefined();
      await allBtn!.trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.findAllComponents(TimelineTurnCard).length).toBe(2);
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

      // Click "Collapse all" icon button in header
      const collapseAllBtn = wrapper.find('header button[title*="Collapse all"]');
      expect(collapseAllBtn.exists()).toBe(true);

      await collapseAllBtn.trigger('click');
      await wrapper.vm.$nextTick();

      for (const card of cards) {
        expect((card.vm as any).isTurnCollapsed).toBe(true);
      }

      // Click "Expand all" icon button in header
      const expandAllBtn = wrapper.find('header button[title*="Expand all"]');
      expect(expandAllBtn.exists()).toBe(true);

      await expandAllBtn.trigger('click');
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
