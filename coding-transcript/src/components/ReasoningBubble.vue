<template>
  <div class="border border-[var(--border-color)] rounded-lg bg-[var(--bg-card)] overflow-hidden transition">
    <div
      @click="toggleExpand"
      class="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-header)] hover:bg-[var(--bg-hover)] cursor-pointer select-none border-b border-[var(--border-color)] text-xs"
    >
      <button
        type="button"
        @click.stop="toggleExpand"
        class="flex items-center gap-2 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer min-w-0"
      >
        <ChevronRight
          class="w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-150 shrink-0"
          :class="{ 'rotate-90': isExpanded }"
        />
        <BrainCircuit class="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
        <span class="font-semibold">{{ title }}</span>
        <span class="text-[11px] text-[var(--text-muted)] font-normal">
          ({{ isExpanded ? 'Hide Thinking' : 'Show Thinking' }})
        </span>
      </button>

      <div class="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)] shrink-0">
        <button
          v-if="isExpanded"
          type="button"
          @click.stop="handleCopy"
          class="text-[11px] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer transition"
          title="Copy reasoning"
        >
          <component :is="isCopied ? Check : Copy" class="w-3 h-3 text-[var(--text-muted)]" />
          <span>{{ isCopied ? 'Copied' : 'Copy' }}</span>
        </button>
        <span v-if="!isExpanded && content" class="text-[10px]">
          {{ content.length }} chars
        </span>
      </div>
    </div>

    <!-- Collapsible markdown content -->
    <div
      v-if="isExpanded"
      class="p-3 bg-[var(--bg-primary)] overflow-x-auto max-h-80 overflow-y-auto"
    >
      <div
        class="markdown-body text-xs text-[var(--text-secondary)] leading-relaxed"
        v-html="renderMarkdown(content)"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ChevronRight, BrainCircuit, Copy, Check } from 'lucide-vue-next';
import { renderMarkdown } from '../utils/markdown';

const props = withDefaults(
  defineProps<{
    content: string;
    defaultExpanded?: boolean;
    title?: string;
  }>(),
  {
    defaultExpanded: false,
    title: 'Reasoning / Thought',
  }
);

const isExpanded = ref(props.defaultExpanded);
const isCopied = ref(false);

function toggleExpand() {
  isExpanded.value = !isExpanded.value;
}

async function handleCopy() {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API unavailable');
    }
    await navigator.clipboard.writeText(props.content);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Copy failed:', err);
  }
}

defineExpose({
  isExpanded,
  toggleExpand,
});
</script>
