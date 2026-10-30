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
          @click="toggleCollapse(block.id)"
          class="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-header)] hover:bg-[var(--bg-hover)] cursor-pointer select-none border-b border-[var(--border-color)] text-xs"
        >
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <ChevronRight
              class="w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-150 shrink-0"
              :class="{ 'rotate-90': !isCollapsed(block.id) }"
            />

            <!-- Tag pill -->
            <span class="px-1.5 py-0.5 rounded font-mono text-[10px] uppercase font-bold tracking-wider border border-[var(--border-color)] text-[var(--text-primary)] shrink-0">
              &lt;{{ block.tagName }}&gt;
            </span>

            <!-- If collapsed: show tag content preview in same single line -->
            <span
              v-if="isCollapsed(block.id)"
              class="text-xs text-[var(--text-muted)] truncate flex-1 font-mono"
            >
              {{ block.content.slice(0, 120).replace(/\n/g, ' ') }}
            </span>
          </div>

          <span class="text-[10px] text-[var(--text-muted)] font-mono shrink-0 ml-2">
            {{ block.content.length }} chars
          </span>
        </div>

        <!-- Tag Content when not collapsed -->
        <div v-show="!isCollapsed(block.id)" class="p-3 bg-[var(--bg-primary)]">
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
import { ref, computed } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import { parseXmlBlocks, type XmlBlock } from '../utils/xmlParser';
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

// Initialize collapse state:
// We collapse metadata/settings tags by default (e.g. ADDITIONAL_METADATA, USER_SETTINGS_CHANGE),
// but keep USER_REQUEST expanded.
blocks.value.forEach((b) => {
  if (b.isTag) {
    if (b.tagName === 'USER_REQUEST') {
      collapsedMap.value[b.id] = false;
    } else if (b.tagName === 'ADDITIONAL_METADATA' || b.tagName === 'USER_SETTINGS_CHANGE') {
      collapsedMap.value[b.id] = true;
    } else {
      collapsedMap.value[b.id] = props.defaultCollapsed;
    }
  }
});

function isCollapsed(id: string) {
  return collapsedMap.value[id] ?? false;
}

function toggleCollapse(id: string) {
  collapsedMap.value[id] = !isCollapsed(id);
}

function setAllCollapsed(collapse: boolean) {
  blocks.value.forEach((b) => {
    if (b.isTag) {
      collapsedMap.value[b.id] = collapse;
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
