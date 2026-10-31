<template>
  <div class="sticky top-12 z-30 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-color)] px-4 py-2">
    <div class="max-w-6xl mx-auto flex items-center justify-between gap-4 text-xs font-mono">
      <div class="flex items-center gap-3 overflow-x-auto select-none py-0.5">
        <span class="text-[var(--text-secondary)] font-medium whitespace-nowrap">
          {{ recordCount }} <span class="text-[var(--text-muted)] font-normal">records</span>
        </span>
        <span class="text-[var(--text-muted)]">•</span>
        <span class="text-[var(--text-secondary)] font-medium whitespace-nowrap">
          {{ turnCount }} <span class="text-[var(--text-muted)] font-normal">turns</span>
        </span>

        <template v-if="tokens.total > 0">
          <span class="text-[var(--border-color)]">|</span>
          <span class="text-[var(--text-secondary)] whitespace-nowrap" title="Prompt / Input tokens">
            <span class="text-[var(--text-muted)]">In:</span> {{ formatNumber(tokens.input) }}
          </span>
          <span class="text-[var(--text-muted)]">•</span>
          <span class="text-[var(--text-secondary)] whitespace-nowrap" title="Generated / Output tokens">
            <span class="text-[var(--text-muted)]">Out:</span> {{ formatNumber(tokens.output) }}
          </span>
          <template v-if="tokens.cacheRead > 0">
            <span class="text-[var(--text-muted)]">•</span>
            <span class="text-[var(--text-secondary)] whitespace-nowrap" title="Cache read / Prompt cache tokens">
              <span class="text-[var(--text-muted)]">Cached:</span> {{ formatNumber(tokens.cacheRead) }}
            </span>
          </template>
          <span class="text-[var(--text-muted)]">•</span>
          <span class="text-[var(--text-primary)] font-semibold whitespace-nowrap" title="Total tokens across conversation">
            <span class="text-[var(--text-muted)] font-normal">Total:</span> {{ formatNumber(tokens.total) }}
          </span>
        </template>
      </div>

      <button
        @click="emit('close')"
        class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition cursor-pointer shrink-0"
        title="Close statistics bar"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { formatNumber } from '../utils/markdown';

export interface TokenMetrics {
  input: number;
  output: number;
  cacheRead: number;
  total: number;
}

defineProps<{
  recordCount: number;
  turnCount: number;
  tokens: TokenMetrics;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>
