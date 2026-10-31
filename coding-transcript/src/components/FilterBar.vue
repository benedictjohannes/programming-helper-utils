<template>
  <div class="sticky top-12 z-30 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-color)] px-4 py-2">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
      <!-- Filter Toggles -->
      <div class="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto text-[11px] select-none shrink-0 py-0.5">
        <span class="text-xs text-[var(--text-muted)] font-medium mr-1 hidden sm:inline">View:</span>

        <!-- User Messages -->
        <button
          @click="toggleFilter('user')"
          :class="[
            'px-2 py-1 rounded-md border flex items-center gap-1.5 transition cursor-pointer',
            filters.user
              ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium bg-[var(--bg-card)]'
              : 'border-[var(--border-color)] text-[var(--text-muted)] line-through opacity-60 hover:opacity-100'
          ]"
          title="Toggle user messages visibility"
        >
          <User class="w-3.5 h-3.5" />
          <span>User</span>
          <span class="px-1 py-0.2 rounded text-[10px] font-mono border border-[var(--border-color)] bg-[var(--bg-header)]">
            {{ counts.user }}
          </span>
        </button>

        <!-- Assistant Responses -->
        <button
          @click="toggleFilter('assistant')"
          :class="[
            'px-2 py-1 rounded-md border flex items-center gap-1.5 transition cursor-pointer',
            filters.assistant
              ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium bg-[var(--bg-card)]'
              : 'border-[var(--border-color)] text-[var(--text-muted)] line-through opacity-60 hover:opacity-100'
          ]"
          title="Toggle assistant text responses visibility"
        >
          <Bot class="w-3.5 h-3.5" />
          <span>Assistant</span>
          <span class="px-1 py-0.2 rounded text-[10px] font-mono border border-[var(--border-color)] bg-[var(--bg-header)]">
            {{ counts.assistant }}
          </span>
        </button>

        <!-- Tool Calls -->
        <button
          @click="toggleFilter('tool')"
          :class="[
            'px-2 py-1 rounded-md border flex items-center gap-1.5 transition cursor-pointer',
            filters.tool
              ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium bg-[var(--bg-card)]'
              : 'border-[var(--border-color)] text-[var(--text-muted)] line-through opacity-60 hover:opacity-100'
          ]"
          title="Toggle tool calls & diffs visibility"
        >
          <Terminal class="w-3.5 h-3.5" />
          <span>Tools</span>
          <span class="px-1 py-0.2 rounded text-[10px] font-mono border border-[var(--border-color)] bg-[var(--bg-header)]">
            {{ counts.tool }}
          </span>
        </button>

        <!-- Reasoning / Thinking -->
        <button
          @click="toggleFilter('reasoning')"
          :class="[
            'px-2 py-1 rounded-md border flex items-center gap-1.5 transition cursor-pointer',
            filters.reasoning
              ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium bg-[var(--bg-card)]'
              : 'border-[var(--border-color)] text-[var(--text-muted)] line-through opacity-60 hover:opacity-100'
          ]"
          title="Toggle model reasoning/thinking blocks visibility"
        >
          <Brain class="w-3.5 h-3.5" />
          <span>Reasoning</span>
          <span class="px-1 py-0.2 rounded text-[10px] font-mono border border-[var(--border-color)] bg-[var(--bg-header)]">
            {{ counts.reasoning }}
          </span>
        </button>

        <!-- System Messages -->
        <button
          v-if="counts.system > 0"
          @click="toggleFilter('system')"
          :class="[
            'px-2 py-1 rounded-md border flex items-center gap-1.5 transition cursor-pointer',
            filters.system
              ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium bg-[var(--bg-card)]'
              : 'border-[var(--border-color)] text-[var(--text-muted)] line-through opacity-60 hover:opacity-100'
          ]"
          title="Toggle system messages visibility"
        >
          <SlidersHorizontal class="w-3.5 h-3.5" />
          <span>System</span>
          <span class="px-1 py-0.2 rounded text-[10px] font-mono border border-[var(--border-color)] bg-[var(--bg-header)]">
            {{ counts.system }}
          </span>
        </button>
      </div>

      <!-- Presets & Close Action -->
      <div class="flex items-center gap-2 self-end sm:self-auto text-xs shrink-0">
        <button
          @click="applyPreset('chatOnly')"
          class="px-2 py-0.5 rounded text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition cursor-pointer border border-[var(--border-color)]"
          title="Show only human conversation (User and Assistant text)"
        >
          Chat only
        </button>
        <button
          @click="applyPreset('toolsOnly')"
          class="px-2 py-0.5 rounded text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition cursor-pointer border border-[var(--border-color)]"
          title="Show only tool executions and reasoning"
        >
          Tools only
        </button>
        <button
          @click="applyPreset('all')"
          class="px-2 py-0.5 rounded text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition cursor-pointer border border-[var(--border-color)]"
          title="Reset all filters to visible"
        >
          All
        </button>

        <span class="text-[var(--border-color)]">|</span>

        <button
          @click="emit('close')"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
          title="Close filter bar"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { User, Bot, Terminal, Brain, SlidersHorizontal, X } from 'lucide-vue-next';

export interface VisibilityFilters {
  user: boolean;
  assistant: boolean;
  tool: boolean;
  reasoning: boolean;
  system: boolean;
}

export interface FilterCounts {
  user: number;
  assistant: number;
  tool: number;
  reasoning: number;
  system: number;
}

const props = defineProps<{
  filters: VisibilityFilters;
  counts: FilterCounts;
}>();

const emit = defineEmits<{
  (e: 'update:filters', val: VisibilityFilters): void;
  (e: 'close'): void;
}>();

function toggleFilter(key: keyof VisibilityFilters) {
  emit('update:filters', {
    ...props.filters,
    [key]: !props.filters[key],
  });
}

function applyPreset(preset: 'chatOnly' | 'toolsOnly' | 'all') {
  if (preset === 'chatOnly') {
    emit('update:filters', {
      user: true,
      assistant: true,
      system: true,
      tool: false,
      reasoning: false,
    });
  } else if (preset === 'toolsOnly') {
    emit('update:filters', {
      user: false,
      assistant: false,
      system: false,
      tool: true,
      reasoning: true,
    });
  } else if (preset === 'all') {
    emit('update:filters', {
      user: true,
      assistant: true,
      tool: true,
      reasoning: true,
      system: true,
    });
  }
}
</script>
