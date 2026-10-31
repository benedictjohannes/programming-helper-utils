<template>
  <div class="min-h-full flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <!-- Main Top Navbar -->
    <header class="border-b border-[var(--border-color)] bg-[var(--bg-card)] sticky top-0 z-40">
      <div class="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-md border border-[var(--border-color)] bg-[var(--bg-header)] flex items-center justify-center font-bold text-xs">
            ⚡
          </div>
          <span class="font-bold text-xs tracking-tight hidden sm:inline">Transcript Viewer</span>

          <!-- Platform badge: Vercel / Geist style pill with colored status dot -->
          <span
            v-if="currentPlatform"
            class="px-2 py-0.5 rounded-full text-[11px] leading-none font-medium border border-[var(--border-color)] bg-[var(--bg-header)] text-[var(--text-primary)] inline-flex items-center gap-1.5 shadow-xs"
          >
            <span
              class="w-1.5 h-1.5 rounded-full shrink-0 translate-y-[0.5px]"
              :class="currentPlatform.dotColor || 'bg-zinc-400'"
            />
            <span>{{ currentPlatform.name }}</span>
          </span>

          <span v-if="loadedFilename" class="text-xs font-mono text-[var(--text-muted)] truncate max-w-xs px-2 py-0.5 rounded border border-[var(--border-color)] hidden md:inline">
            {{ loadedFilename }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <!-- Summary statistics pill -->
          <div v-if="timeline.length > 0" class="hidden sm:flex items-center gap-2.5 text-xs text-[var(--text-muted)] font-mono">
            <span>{{ recordCount }} records</span>
            <span>•</span>
            <span>{{ timeline.length }} turns</span>
            <template v-if="totalTokens > 0">
              <span>•</span>
              <span title="Total tokens across conversation">
                tokens: {{ formatNumber(totalTokens) }}
              </span>
            </template>
          </div>

          <!-- Collapse / Expand All turns -->
          <div v-if="timeline.length > 0" class="flex items-center gap-1 border-l border-[var(--border-color)] pl-2">
            <button
              @click="toggleAllTurns(true)"
              class="px-2 py-1 rounded text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
              title="Collapse all conversation turns"
            >
              Collapse all
            </button>
            <span class="text-[var(--text-muted)] text-[10px]">•</span>
            <button
              @click="toggleAllTurns(false)"
              class="px-2 py-1 rounded text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
              title="Expand all conversation turns"
            >
              Expand all
            </button>
          </div>

          <!-- Dark / Light theme toggle -->
          <button
            @click="toggleTheme"
            class="p-1.5 rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition cursor-pointer"
            :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
          >
            <Sun v-if="isDark" class="w-3.5 h-3.5" />
            <Moon v-else class="w-3.5 h-3.5" />
          </button>

          <!-- Load another file button -->
          <button
            v-if="timeline.length > 0"
            @click="resetViewer"
            class="px-2.5 py-1 rounded-md text-xs font-medium border border-[var(--border-color)] hover:bg-[var(--bg-hover)] flex items-center gap-1.5 transition cursor-pointer"
          >
            <FolderOpen class="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Open</span>
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
      <!-- Search & Filter bar -->
      <SearchBar
        v-model="searchQuery"
        v-model:filters="searchFilters"
        :totalMatches="searchMatches.length"
        :currentIndex="currentSearchMatchIndex"
        @prev="goToPrevMatch"
        @next="goToNextMatch"
      />

      <!-- Timeline List -->
      <div class="max-w-6xl w-full mx-auto px-4 py-4 space-y-3 flex-1">
        <TimelineTurnCard
          v-for="(item, idx) in timeline"
          :key="item.id"
          :item="item"
          :ref="el => registerCardRef(el, idx)"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { FolderOpen, Sun, Moon } from 'lucide-vue-next';
import UploadView from './components/UploadView.vue';
import TimelineTurnCard from './components/TimelineTurnCard.vue';
import SearchBar from './components/SearchBar.vue';
import type { TimelineItem } from './types';
import type { PlatformInfo } from './parsers/types';
import { detectAndParse } from './parsers';
import { formatNumber } from './utils/markdown';
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

const cardRefs = ref<any[]>([]);

function registerCardRef(el: any, index: number) {
  if (el) {
    cardRefs.value[index] = el;
  }
}

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

onMounted(() => {
  applyTheme();
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
