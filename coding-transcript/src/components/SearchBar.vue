<template>
  <div class="sticky top-12 z-30 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-color)] px-4 py-2">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center gap-2.5">
      <!-- Search Input -->
      <div class="relative flex-1 w-full">
        <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-[var(--text-muted)]">
          <Search class="w-3.5 h-3.5" />
        </div>
        <input
          ref="inputRef"
          v-model="query"
          @keydown.enter.prevent="handleEnter"
          @keydown.esc="emit('close')"
          type="text"
          placeholder="Search prompts, responses, tool inputs & outputs (Enter / Shift+Enter)..."
          class="w-full pl-8 pr-24 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-subtle)]"
        />

        <div class="absolute inset-y-0 right-1 flex items-center gap-1 text-xs">
          <span v-if="query.trim()" class="text-[var(--text-muted)] text-[11px] px-1 font-mono">
            {{ totalMatches > 0 ? `${currentIndex + 1}/${totalMatches}` : 'No matches' }}
          </span>

          <button
            @click="emit('prev')"
            :disabled="totalMatches === 0"
            class="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed rounded cursor-pointer"
            title="Previous match (Shift+Enter)"
          >
            <ChevronUp class="w-3.5 h-3.5" />
          </button>
          <button
            @click="emit('next')"
            :disabled="totalMatches === 0"
            class="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed rounded cursor-pointer"
            title="Next match (Enter)"
          >
            <ChevronDown class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Scope Toggles & Close Action -->
      <div class="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0">
        <div class="flex items-center gap-1 overflow-x-auto text-[11px] select-none">
          <button
            @click="toggleFilter('userInput')"
            :class="[
              'px-2 py-1 rounded-md border transition cursor-pointer',
              filters.userInput ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            ]"
          >
            User
          </button>
          <button
            @click="toggleFilter('modelResponse')"
            :class="[
              'px-2 py-1 rounded-md border transition cursor-pointer',
              filters.modelResponse ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            ]"
          >
            Assistant
          </button>
          <button
            @click="toggleFilter('toolInput')"
            :class="[
              'px-2 py-1 rounded-md border transition cursor-pointer',
              filters.toolInput ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            ]"
          >
            Tool Input
          </button>
          <button
            @click="toggleFilter('toolOutput')"
            :class="[
              'px-2 py-1 rounded-md border transition cursor-pointer',
              filters.toolOutput ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            ]"
          >
            Tool Output
          </button>
          <button
            @click="toggleFilter('systemMessage')"
            :class="[
              'px-2 py-1 rounded-md border transition cursor-pointer',
              filters.systemMessage ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-medium' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            ]"
          >
            System
          </button>
        </div>

        <button
          @click="emit('close')"
          class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition cursor-pointer shrink-0 ml-1"
          title="Close search bar (Esc)"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-vue-next';
import type { FilterOptions } from '../utils/search';

const props = defineProps<{
  modelValue: string;
  filters: FilterOptions;
  totalMatches: number;
  currentIndex: number;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
  (e: 'update:filters', val: FilterOptions): void;
  (e: 'prev'): void;
  (e: 'next'): void;
  (e: 'close'): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  inputRef.value?.focus();
});

const query = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val),
});

function toggleFilter(key: keyof FilterOptions) {
  emit('update:filters', {
    ...props.filters,
    [key]: !props.filters[key],
  });
}

function handleEnter(e: KeyboardEvent) {
  if (e.shiftKey) {
    emit('prev');
  } else {
    emit('next');
  }
}

defineExpose({
  focus: () => inputRef.value?.focus(),
});
</script>
