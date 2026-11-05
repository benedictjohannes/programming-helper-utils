<template>
  <div class="space-y-2">
    <div
      v-for="(block, idx) in blocks"
      :key="block.id"
      class="border border-[var(--border-color)] rounded-lg bg-[var(--bg-card)] overflow-hidden transition"
    >
      <!-- If it's an XML tag bubble -->
      <template v-if="block.isTag">
        <div
          @click="toggleCollapse(block)"
          class="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-header)] select-none border-b border-[var(--border-color)] text-xs transition-colors"
          :class="{
            'hover:bg-[var(--bg-hover)] cursor-pointer': !isEmptyBlock(block),
            'cursor-default opacity-80': isEmptyBlock(block),
          }"
        >
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <ChevronRight
              v-if="!isEmptyBlock(block)"
              class="w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-150 shrink-0"
              :class="{ 'rotate-90': !isCollapsed(block.id) }"
            />
            <span v-else class="w-3.5 h-3.5 shrink-0" />

            <!-- Tag pill -->
            <span class="px-1.5 py-0.5 rounded font-mono text-[10px] uppercase font-bold tracking-wider border border-[var(--border-color)] text-[var(--text-primary)] shrink-0">
              &lt;{{ block.tagName }}&gt;
            </span>

            <!-- If empty: show italic (empty) -->
            <span
              v-if="isEmptyBlock(block)"
              class="text-[11px] text-[var(--text-muted)] italic font-mono"
            >
              (empty)
            </span>

            <!-- If collapsed: show tag content preview in same single line -->
            <span
              v-else-if="isCollapsed(block.id)"
              class="text-xs text-[var(--text-muted)] truncate flex-1 font-mono"
            >
              {{ block.content.slice(0, 120).replace(/\n/g, ' ') }}
            </span>
          </div>

          <span class="text-[10px] text-[var(--text-muted)] font-mono shrink-0 ml-2">
            {{ block.content.trim().length }} chars
          </span>
        </div>

        <!-- Tag Content when not collapsed and not empty -->
        <div v-show="!isCollapsed(block.id) && !isEmptyBlock(block)" class="p-3 bg-[var(--bg-primary)]">
          <!-- Recursively check if tag content itself contains nested XML tags (like <SKILL>) -->
          <template v-if="hasNestedTags(block.content)">
            <XmlBubbleView
              :ref="el => registerNestedRef(el, idx)"
              :content="block.content"
              :defaultCollapsed="false"
            />
          </template>
          <div v-else class="markdown-body" v-html="renderMarkdown(block.content)"></div>
        </div>
      </template>

      <!-- Plain text block -->
      <div v-else class="p-3 bg-[var(--bg-primary)]">
        <div class="markdown-body" v-html="renderMarkdown(block.content)"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import { parseXmlBlocks, isTagDefaultCollapsed, type XmlBlock } from '../utils/xmlParser';
import { renderMarkdown } from '../utils/markdown';

const props = withDefaults(
  defineProps<{
    content: string;
    defaultCollapsed?: boolean;
  }>(),
  {
    defaultCollapsed: false,
  }
);

const blocks = computed(() => parseXmlBlocks(props.content));
const collapsedMap = ref<Record<string, boolean>>({});
const nestedRefs = ref<any[]>([]);

function registerNestedRef(el: any, idx: number) {
  if (el) {
    nestedRefs.value[idx] = el;
  }
}

function isEmptyBlock(block: XmlBlock): boolean {
  return !block.content || block.content.trim().length === 0;
}

function initBlockCollapse(block: XmlBlock) {
  if (!block.isTag) return;
  if (isEmptyBlock(block)) {
    collapsedMap.value[block.id] = true;
    return;
  }
  if (collapsedMap.value[block.id] !== undefined) return;
  collapsedMap.value[block.id] = isTagDefaultCollapsed(block.tagName, props.defaultCollapsed);
}

// Reactively initialize collapse state on mount and when content dynamically changes:
// We collapse metadata/settings tags by default (e.g. ADDITIONAL_METADATA, USER_SETTINGS_CHANGE),
// but keep USER_REQUEST expanded.
watch(
  blocks,
  (newBlocks) => {
    newBlocks.forEach(initBlockCollapse);
  },
  { immediate: true }
);

function isCollapsed(id: string) {
  return collapsedMap.value[id] ?? false;
}

function toggleCollapse(block: XmlBlock) {
  if (isEmptyBlock(block)) return;
  collapsedMap.value[block.id] = !isCollapsed(block.id);
}

function setAllCollapsed(collapse: boolean) {
  blocks.value.forEach((b) => {
    if (b.isTag) {
      if (isEmptyBlock(b)) {
        collapsedMap.value[b.id] = true;
      } else {
        collapsedMap.value[b.id] = collapse;
      }
    }
  });
  // Recursively collapse/expand nested XmlBubbleViews
  nestedRefs.value.forEach((nested) => {
    if (nested?.setAllCollapsed) {
      nested.setAllCollapsed(collapse);
    }
  });
}

defineExpose({
  setAllCollapsed,
});

function hasNestedTags(text: string): boolean {
  return /<([A-Za-z0-9_-]+)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/i.test(text);
}
</script>
