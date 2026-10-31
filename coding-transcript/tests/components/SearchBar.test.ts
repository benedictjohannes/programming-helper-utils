import { describe, it, expect } from 'bun:test';
import { mount } from '@vue/test-utils';
import SearchBar from '../../src/components/SearchBar.vue';
import type { FilterOptions } from '../../src/utils/search';

describe('Search Bar Component (SearchBar.vue)', () => {
  const defaultFilters: FilterOptions = {
    userInput: true,
    modelResponse: true,
    toolInput: true,
    toolOutput: true,
    systemMessage: true,
  };

  describe('Input & Emits', () => {
    it('emits update:modelValue when text is typed into the search input', async () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: '',
          filters: defaultFilters,
          totalMatches: 0,
          currentIndex: 0,
        },
      });

      const input = wrapper.find('input[type="text"]');
      await input.setValue('findThisQuery');

      expect(wrapper.emitted('update:modelValue')).toBeTruthy();
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['findThisQuery']);
    });

    it('emits update:filters with toggled filter state when scope buttons are clicked', async () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: 'search',
          filters: defaultFilters,
          totalMatches: 3,
          currentIndex: 0,
        },
      });

      // Find the "User" scope toggle button
      const buttons = wrapper.findAll('button');
      const userButton = buttons.find((b) => b.text() === 'User');
      expect(userButton).toBeDefined();

      await userButton!.trigger('click');

      expect(wrapper.emitted('update:filters')).toBeTruthy();
      expect(wrapper.emitted('update:filters')![0]![0]).toEqual({
        ...defaultFilters,
        userInput: false, // toggled from true to false
      });
    });

    it('toggles toolInput filter when Tool Input button is clicked', async () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: 'search',
          filters: defaultFilters,
          totalMatches: 1,
          currentIndex: 0,
        },
      });

      const toolInputBtn = wrapper.findAll('button').find((b) => b.text() === 'Tool Input');
      expect(toolInputBtn).toBeDefined();

      await toolInputBtn!.trigger('click');
      expect(wrapper.emitted('update:filters')![0]![0]).toEqual({
        ...defaultFilters,
        toolInput: false,
      });
    });

    it('toggles systemMessage filter when System button is clicked', async () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: 'search',
          filters: defaultFilters,
          totalMatches: 1,
          currentIndex: 0,
        },
      });

      const systemBtn = wrapper.findAll('button').find((b) => b.text() === 'System');
      expect(systemBtn).toBeDefined();

      await systemBtn!.trigger('click');
      expect(wrapper.emitted('update:filters')![0]![0]).toEqual({
        ...defaultFilters,
        systemMessage: false,
      });
    });
  });

  describe('Navigation', () => {
    it('dispatches next match on Enter keypress in input', async () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: 'test',
          filters: defaultFilters,
          totalMatches: 5,
          currentIndex: 1,
        },
      });

      const input = wrapper.find('input[type="text"]');
      await input.trigger('keydown.enter', { shiftKey: false });

      expect(wrapper.emitted('next')).toBeTruthy();
      expect(wrapper.emitted('prev')).toBeFalsy();
    });

    it('dispatches previous match on Shift+Enter keypress in input', async () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: 'test',
          filters: defaultFilters,
          totalMatches: 5,
          currentIndex: 1,
        },
      });

      const input = wrapper.find('input[type="text"]');
      await input.trigger('keydown.enter', { shiftKey: true });

      expect(wrapper.emitted('prev')).toBeTruthy();
      expect(wrapper.emitted('next')).toBeFalsy();
    });

    it('dispatches next and prev events when clicking the chevron buttons', async () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: 'test',
          filters: defaultFilters,
          totalMatches: 5,
          currentIndex: 2,
        },
      });

      const prevBtn = wrapper.find('button[title*="Previous match"]');
      const nextBtn = wrapper.find('button[title*="Next match"]');

      expect(prevBtn.exists()).toBe(true);
      expect(nextBtn.exists()).toBe(true);

      await prevBtn.trigger('click');
      expect(wrapper.emitted('prev')).toBeTruthy();

      await nextBtn.trigger('click');
      expect(wrapper.emitted('next')).toBeTruthy();
    });

    it('disables prev and next buttons when totalMatches is 0', () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: 'nonexistent',
          filters: defaultFilters,
          totalMatches: 0,
          currentIndex: 0,
        },
      });

      const prevBtn = wrapper.find('button[title*="Previous match"]');
      const nextBtn = wrapper.find('button[title*="Next match"]');

      expect(prevBtn.attributes('disabled')).toBeDefined();
      expect(nextBtn.attributes('disabled')).toBeDefined();
    });
  });

  describe('Counter Display', () => {
    it('does not display counter indicator when search query is empty', () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: '',
          filters: defaultFilters,
          totalMatches: 0,
          currentIndex: 0,
        },
      });

      expect(wrapper.text()).not.toContain('No matches');
      expect(wrapper.text()).not.toContain('/');
    });

    it('displays "No matches" when query is non-empty and totalMatches is 0', () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: 'foobar',
          filters: defaultFilters,
          totalMatches: 0,
          currentIndex: 0,
        },
      });

      expect(wrapper.text()).toContain('No matches');
    });

    it('correctly renders X of Y match counter indicator (e.g. 2/5)', () => {
      const wrapper = mount(SearchBar, {
        props: {
          modelValue: 'foobar',
          filters: defaultFilters,
          totalMatches: 5,
          currentIndex: 1, // 0-based index 1 -> display "2/5"
        },
      });

      expect(wrapper.text()).toContain('2/5');
    });
  });
});
