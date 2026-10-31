<template>
  <div class="min-h-full flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <!-- Main Top Navbar -->
    <header class="border-b border-[var(--border-color)] bg-[var(--bg-card)] sticky top-0 z-40">
      <div class="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between gap-2">
        <!-- Left: Brand & File info -->
        <div class="flex items-center gap-2.5 min-w-0">
          <!-- Logo: hidden on mobile -->
          <div class="w-7 h-7 rounded-md border border-[var(--border-color)] bg-[var(--bg-header)] hidden sm:flex items-center justify-center font-bold text-xs shrink-0">
            ⚡
          </div>
          <!-- Title: hidden on mobile -->
          <span class="font-bold text-xs tracking-tight hidden sm:inline shrink-0">Transcript Viewer</span>

          <!-- Platform badge: Vercel / Geist style pill with colored status dot -->
          <span
            v-if="currentPlatform"
            class="px-2 py-0.5 rounded-full text-[11px] leading-none font-medium border border-[var(--border-color)] bg-[var(--bg-header)] text-[var(--text-primary)] hidden md:inline-flex items-center gap-1.5 shadow-xs shrink-0"
          >
            <span
              class="w-1.5 h-1.5 rounded-full shrink-0 translate-y-[0.5px]"
              :class="currentPlatform.dotColor || 'bg-zinc-400'"
            />
            <span>{{ currentPlatform.name }}</span>
          </span>

          <!-- File name: truncated, visible on both mobile and desktop -->
          <span v-if="loadedFilename" class="text-xs font-mono text-[var(--text-muted)] truncate max-w-[150px] xs:max-w-[220px] sm:max-w-xs px-2 py-0.5 rounded border border-[var(--border-color)]">
            {{ loadedFilename }}
          </span>
        </div>

        <!-- Right: Icon button strip -->
        <div class="flex items-center gap-1 shrink-0">
          <template v-if="timeline.length > 0">
            <!-- 1. Collapse all turns -->
            <button
              @click="toggleAllTurns(true)"
              class="p-1.5 rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              title="Collapse all conversation turns"
            >
              <FoldVertical class="w-3.5 h-3.5" />
            </button>

            <!-- 2. Expand all turns -->
            <button
              @click="toggleAllTurns(false)"
              class="p-1.5 rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              title="Expand all conversation turns"
            >
              <UnfoldVertical class="w-3.5 h-3.5" />
            </button>

            <!-- 3. Search Bar Toggler -->
            <button
              @click="toggleSecondaryBar('search')"
              :class="[
                'p-1.5 rounded-md border transition cursor-pointer',
                secondaryBarShown === 'search'
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)] bg-[var(--bg-hover)] font-medium'
                  : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              ]"
              title="Search transcript (Ctrl+F)"
            >
              <Search class="w-3.5 h-3.5" />
            </button>

            <!-- 4. Filter Bar Toggler -->
            <button
              @click="toggleSecondaryBar('filter')"
              :class="[
                'p-1.5 rounded-md border relative transition cursor-pointer',
                secondaryBarShown === 'filter'
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)] bg-[var(--bg-hover)] font-medium'
                  : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              ]"
              title="Filter visible elements"
            >
              <Filter class="w-3.5 h-3.5" />
              <span
                v-if="isFiltered"
                class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500"
              />
            </button>

            <!-- 5. Statistics Bar Toggler -->
            <button
              @click="toggleSecondaryBar('stats')"
              :class="[
                'p-1.5 rounded-md border transition cursor-pointer',
                secondaryBarShown === 'stats'
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)] bg-[var(--bg-hover)] font-medium'
                  : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              ]"
              title="Transcript statistics"
            >
              <BarChart3 class="w-3.5 h-3.5" />
            </button>

            <!-- 6. Close Transcript / Open another file -->
            <button
              @click="resetViewer"
              class="p-1.5 rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              title="Close transcript / Open another file"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </template>

          <!-- 7. Dark / Light theme toggle (always last) -->
          <button
            @click="toggleTheme"
            class="p-1.5 rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
            :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
          >
            <Sun v-if="isDark" class="w-3.5 h-3.5" />
            <Moon v-else class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>

    <!-- Upload Screen -->
    <main v-if="timeline.length === 0" class="flex-1 flex items-center justify-center">
      <UploadView @load="handleTranscriptLoaded" />
    </main>

    <!-- Loaded Transcript Screen -->
    <main v-else class="flex-1 flex flex-col">
      <!-- Mutually Exclusive Sticky Secondary Bars -->
      <SearchBar
        v-if="secondaryBarShown === 'search'"
        v-model="searchQuery"
        v-model:filters="searchFilters"
        :totalMatches="searchMatches.length"
        :currentIndex="currentSearchMatchIndex"
        @prev="goToPrevMatch"
        @next="goToNextMatch"
        @close="secondaryBarShown = null"
      />

      <FilterBar
        v-else-if="secondaryBarShown === 'filter'"
        v-model:filters="visibilityFilters"
        :counts="filterCounts"
        @close="secondaryBarShown = null"
      />

      <StatsBar
        v-else-if="secondaryBarShown === 'stats'"
        :recordCount="recordCount"
        :turnCount="timeline.length"
        :tokens="tokenStats"
        @close="secondaryBarShown = null"
      />

      <!-- Timeline List -->
      <div class="max-w-6xl w-full mx-auto px-4 py-4 space-y-3 flex-1">
        <!-- Empty filter state -->
        <div
          v-if="filteredTimeline.length === 0"
          class="text-center py-16 border border-dashed border-[var(--border-color)] rounded-xl bg-[var(--bg-card)] px-4"
        >
          <p class="text-xs font-mono text-[var(--text-muted)]">No turns match the current visibility filters.</p>
          <button
            @click="resetFilters"
            class="mt-3 px-3 py-1 rounded-md text-xs font-mono border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] cursor-pointer"
          >
            Reset filters
          </button>
        </div>

        <TimelineTurnCard
          v-for="(item, idx) in filteredTimeline"
          :key="item.id"
          :item="item"
          :filters="visibilityFilters"
          :ref="el => registerCardRef(el, idx)"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import {
  FoldVertical,
  UnfoldVertical,
  Search,
  Filter,
  BarChart3,
  X,
  Sun,
  Moon
} from 'lucide-vue-next';
import UploadView from './components/UploadView.vue';
import TimelineTurnCard from './components/TimelineTurnCard.vue';
import SearchBar from './components/SearchBar.vue';
import FilterBar, { type VisibilityFilters, type FilterCounts } from './components/FilterBar.vue';
import StatsBar, { type TokenMetrics } from './components/StatsBar.vue';
import type { TimelineItem } from './types';
import type { PlatformInfo } from './parsers/types';
import { detectAndParse } from './parsers';
import { searchTimeline, type FilterOptions } from './utils/search';

const isDark = ref(
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true
);

const timeline = ref<TimelineItem[]>([]);
const loadedFilename = ref<string>('');
const recordCount = ref<number>(0);
const totalTokens = ref<number>(0);
const currentPlatform = ref<PlatformInfo | null>(null);

// Secondary bar state: mutually exclusive
const secondaryBarShown = ref<'search' | 'filter' | 'stats' | null>(
  typeof window !== 'undefined' && window.innerWidth >= 768 ? 'stats' : null
);

function toggleSecondaryBar(bar: 'search' | 'filter' | 'stats') {
  if (secondaryBarShown.value === bar) {
    secondaryBarShown.value = null;
  } else {
    secondaryBarShown.value = bar;
  }
}

// Visibility filters
const visibilityFilters = ref<VisibilityFilters>({
  user: true,
  assistant: true,
  tool: true,
  reasoning: true,
  system: true,
});

const isFiltered = computed(() => {
  return (
    !visibilityFilters.value.user ||
    !visibilityFilters.value.assistant ||
    !visibilityFilters.value.tool ||
    !visibilityFilters.value.reasoning ||
    !visibilityFilters.value.system
  );
});

function resetFilters() {
  visibilityFilters.value = {
    user: true,
    assistant: true,
    tool: true,
    reasoning: true,
    system: true,
  };
}

// Token breakdown statistics
const tokenStats = computed<TokenMetrics>(() => {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  for (const item of timeline.value) {
    if (item.tokens) {
      input += item.tokens.input || 0;
      output += item.tokens.output || 0;
      cacheRead += item.tokens.cacheRead || 0;
    }
  }
  return {
    input,
    output,
    cacheRead,
    total: input + output + cacheRead,
  };
});

// Filter counts across the loaded transcript
const filterCounts = computed<FilterCounts>(() => {
  let user = 0;
  let assistant = 0;
  let tool = 0;
  let reasoning = 0;
  let system = 0;

  for (const item of timeline.value) {
    if (item.type === 'user_input') user++;
    if (item.type === 'system_message') system++;
    if (item.thinking && item.thinking.trim()) reasoning++;
    if (item.tools && item.tools.length > 0) {
      tool += item.tools.length;
    }
    if (item.type === 'model_response' && item.content && item.content.trim()) {
      assistant++;
    }
  }

  return { user, assistant, tool, reasoning, system };
});

function isTurnVisible(item: TimelineItem): boolean {
  if (item.type === 'user_input') return visibilityFilters.value.user;
  if (item.type === 'system_message') return visibilityFilters.value.system;
  if (item.type === 'tool_call') {
    const hasVisibleTools = visibilityFilters.value.tool && Boolean(item.tools && item.tools.length > 0);
    const hasVisibleThinking = visibilityFilters.value.reasoning && Boolean(item.thinking);
    return hasVisibleTools || hasVisibleThinking;
  }
  if (item.type === 'model_response') {
    const hasVisibleContent = visibilityFilters.value.assistant && Boolean(item.content && item.content.trim());
    const hasVisibleThinking = visibilityFilters.value.reasoning && Boolean(item.thinking);
    const hasVisibleTools = visibilityFilters.value.tool && Boolean(item.tools && item.tools.length > 0);
    return hasVisibleContent || hasVisibleThinking || hasVisibleTools;
  }
  return true;
}

const filteredTimeline = computed(() => {
  return timeline.value.filter(isTurnVisible);
});

const cardRefs = ref<any[]>([]);

function registerCardRef(el: any, index: number) {
  if (el) {
    cardRefs.value[index] = el;
  }
}

watch(filteredTimeline, () => {
  cardRefs.value = [];
});

const searchQuery = ref('');
const currentSearchMatchIndex = ref(0);
const searchFilters = ref<FilterOptions>({
  userInput: true,
  modelResponse: true,
  toolInput: true,
  toolOutput: true,
  systemMessage: true,
});

const searchMatches = computed(() => {
  return searchTimeline(timeline.value, searchQuery.value, searchFilters.value);
});

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    secondaryBarShown.value = 'search';
  } else if (e.key === 'Escape' && secondaryBarShown.value !== null) {
    secondaryBarShown.value = null;
  }
}

onMounted(() => {
  applyTheme();
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleGlobalKeydown);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleGlobalKeydown);
  }
});

function toggleTheme() {
  isDark.value = !isDark.value;
  applyTheme();
}

function applyTheme() {
  if (isDark.value) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function toggleAllTurns(collapse: boolean) {
  cardRefs.value.forEach((card) => {
    if (card && card.setTurnCollapsed) {
      card.setTurnCollapsed(collapse);
    }
  });
}

function handleTranscriptLoaded(content: string, filename?: string, forcedPlatform?: string) {
  loadedFilename.value = filename || 'transcript.jsonl';
  cardRefs.value = [];
  const result = detectAndParse(content, forcedPlatform);
  currentPlatform.value = result.platform;
  timeline.value = result.timeline;
  recordCount.value = result.recordCount;
  totalTokens.value = result.totalTokens;
  searchQuery.value = '';
  currentSearchMatchIndex.value = 0;
  // On desktop, default secondary bar to stats
  if (typeof window !== 'undefined' && window.innerWidth >= 768) {
    secondaryBarShown.value = 'stats';
  }
}

function resetViewer() {
  timeline.value = [];
  cardRefs.value = [];
  loadedFilename.value = '';
  recordCount.value = 0;
  totalTokens.value = 0;
  currentPlatform.value = null;
  searchQuery.value = '';
  currentSearchMatchIndex.value = 0;
  secondaryBarShown.value = typeof window !== 'undefined' && window.innerWidth >= 768 ? 'stats' : null;
}

watch(searchMatches, (newMatches) => {
  if (newMatches.length > 0) {
    currentSearchMatchIndex.value = 0;
    scrollToMatch(0);
  } else {
    currentSearchMatchIndex.value = 0;
  }
});

function goToNextMatch() {
  if (searchMatches.value.length === 0) return;
  currentSearchMatchIndex.value = (currentSearchMatchIndex.value + 1) % searchMatches.value.length;
  scrollToMatch(currentSearchMatchIndex.value);
}

function goToPrevMatch() {
  if (searchMatches.value.length === 0) return;
  currentSearchMatchIndex.value =
    (currentSearchMatchIndex.value - 1 + searchMatches.value.length) % searchMatches.value.length;
  scrollToMatch(currentSearchMatchIndex.value);
}

function scrollToMatch(index: number) {
  const match = searchMatches.value[index];
  if (!match) return;

  // If search match belongs to an item that is currently filtered out, ensure that category is visible
  const matchedItem = timeline.value.find(item => item.id === match.itemId);
  if (matchedItem && !isTurnVisible(matchedItem)) {
    if (matchedItem.type === 'user_input') visibilityFilters.value.user = true;
    if (matchedItem.type === 'system_message') visibilityFilters.value.system = true;
    if (matchedItem.type === 'tool_call') visibilityFilters.value.tool = true;
    if (matchedItem.type === 'model_response') visibilityFilters.value.assistant = true;
  }

  nextTick(() => {
    // If target turn is collapsed, expand it
    const targetTurn = cardRefs.value.find((c: any) => c?.item?.id === match.itemId);
    if (targetTurn) {
      if (targetTurn.isTurnCollapsed) {
        targetTurn.setTurnCollapsed(false);
      }
      // If match is inside a specific tool call, ensure that tool call item is expanded
      if (match.subId && targetTurn.expandTool) {
        targetTurn.expandTool(match.subId);
      }
    }

    const targetElement = document.getElementById(match.subId || match.itemId);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetElement.classList.add('outline', 'outline-1', 'outline-amber-500');
      setTimeout(() => {
        targetElement.classList.remove('outline', 'outline-1', 'outline-amber-500');
      }, 1500);
    }
  });
}
</script>
