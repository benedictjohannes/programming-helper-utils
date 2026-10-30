<template>
  <div
    class="border border-[var(--border-color)] rounded-xl bg-[var(--bg-card)] overflow-hidden transition"
    :id="item.id"
  >
    <!-- Turn Header Bar -->
    <div
      @click="isTurnCollapsed = !isTurnCollapsed"
      class="px-3.5 py-2 flex items-center justify-between bg-[var(--bg-header)] hover:bg-[var(--bg-hover)] cursor-pointer select-none border-b border-[var(--border-color)]"
    >
      <div class="flex items-center gap-2.5">
        <ChevronRight
          class="w-4 h-4 text-[var(--text-muted)] transition-transform duration-150"
          :class="{ 'rotate-90': !isTurnCollapsed }"
        />

        <!-- Role Badge -->
        <span
          class="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 border border-[var(--border-color)] text-[var(--text-primary)]"
        >
          <component :is="getRoleIcon(item)" class="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span>{{ getRoleTitle(item) }}</span>
        </span>

        <!-- Step index -->
        <span class="text-xs font-mono text-[var(--text-muted)]">
          #{{ item.stepIndex }}
        </span>

        <!-- Preview snippet when collapsed -->
        <span
          v-if="isTurnCollapsed"
          class="text-xs text-[var(--text-muted)] truncate max-w-md hidden sm:inline"
        >
          {{ getCollapsedSummary(item) }}
        </span>
      </div>

      <div class="flex items-center gap-3 text-xs text-[var(--text-muted)] font-mono">
        <div v-if="item.tokens && (item.tokens.input || item.tokens.output)" class="hidden md:flex items-center gap-2">
          <span v-if="item.tokens.input">in: {{ formatNumber(item.tokens.input) }}</span>
          <span v-if="item.tokens.output">out: {{ formatNumber(item.tokens.output) }}</span>
          <span v-if="item.tokens.cacheRead">cache: {{ formatNumber(item.tokens.cacheRead) }}</span>
        </div>

        <span>{{ formatDateTime(item.createdAt) }}</span>
      </div>
    </div>

    <!-- Turn Body -->
    <div v-show="!isTurnCollapsed" class="p-4 bg-[var(--bg-primary)]">
      <!-- 1. USER INPUT -->
      <div v-if="item.type === 'user_input'">
        <XmlBubbleView ref="xmlBubbleRef" :content="item.content || ''" />
        
        <div v-if="item.media && item.media.length > 0" class="mt-3 pt-2 border-t border-[var(--border-color)] space-y-1.5">
          <div class="text-[11px] font-semibold text-[var(--text-muted)] uppercase">Attached Media</div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(m, idx) in item.media"
              :key="idx"
              class="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-xs font-mono text-[var(--text-secondary)]"
            >
              {{ m.mime_type }}: {{ m.uri }}
            </span>
          </div>
        </div>
      </div>

      <!-- 2. MODEL RESPONSE -->
      <div v-else-if="item.type === 'model_response'">
        <!-- Thinking dropdown if present -->
        <div v-if="item.thinking" class="mb-3">
          <button
            @click="showThinking = !showThinking"
            class="px-2.5 py-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-xs font-medium flex items-center gap-1.5 transition cursor-pointer text-[var(--text-secondary)]"
          >
            <BrainCircuit class="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{{ showThinking ? 'Hide Thinking' : 'Show Thinking' }}</span>
          </button>
          <div v-if="showThinking" class="mt-2 p-2.5 bg-[var(--code-bg)] border border-[var(--border-color)] rounded-lg text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap max-h-72 overflow-y-auto">
            {{ item.thinking }}
          </div>
        </div>

        <XmlBubbleView ref="xmlBubbleRef" v-if="hasXmlTags(item.content || '')" :content="item.content || ''" />
        <div v-else class="markdown-body" v-html="renderMarkdown(item.content || '')"></div>
      </div>

      <!-- 3. TOOL EXECUTIONS -->
      <div v-else-if="item.type === 'tool_executions' && item.tools">
        <!-- Thinking dropdown if present on tool executions -->
        <div v-if="item.thinking" class="mb-3">
          <button
            @click="showThinking = !showThinking"
            class="px-2.5 py-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-xs font-medium flex items-center gap-1.5 transition cursor-pointer text-[var(--text-secondary)]"
          >
            <BrainCircuit class="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{{ showThinking ? 'Hide Thinking' : 'Show Thinking' }}</span>
          </button>
          <div v-if="showThinking" class="mt-2 p-2.5 bg-[var(--code-bg)] border border-[var(--border-color)] rounded-lg text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap max-h-72 overflow-y-auto">
            {{ item.thinking }}
          </div>
        </div>

        <!-- Tool activity group header / toggle -->
        <div class="flex items-center justify-between mb-2 pb-1.5 border-b border-[var(--border-color)]">
          <div class="text-xs text-[var(--text-muted)] font-medium">
            {{ item.tools.length }} {{ item.tools.length === 1 ? 'tool call' : 'tool calls' }}
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="toggleAllTools(true)"
              class="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Expand all
            </button>
            <span class="text-[var(--text-muted)] text-[10px]">•</span>
            <button
              @click="toggleAllTools(false)"
              class="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Collapse all
            </button>
          </div>
        </div>
        <ToolCallsList ref="toolListRef" :tools="item.tools" />
      </div>

      <!-- 4. SYSTEM MESSAGE -->
      <div v-else-if="item.type === 'system_message'">
        <XmlBubbleView ref="xmlBubbleRef" v-if="hasXmlTags(item.content || '')" :content="item.content || ''" />
        <div v-else class="font-mono text-xs text-[var(--text-secondary)] whitespace-pre-wrap bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-2.5">
          {{ item.content }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { TimelineItem } from '../types';
import { renderMarkdown, formatDateTime, formatNumber } from '../utils/markdown';
import ToolCallsList from './ToolCallsList.vue';
import XmlBubbleView from './XmlBubbleView.vue';
import {
  User,
  Bot,
  Wrench,
  AlertCircle,
  BrainCircuit,
  ChevronRight
} from 'lucide-vue-next';

const props = defineProps<{
  item: TimelineItem;
}>();

const isTurnCollapsed = ref(false);
const showThinking = ref(false);
const toolListRef = ref<any>(null);
const xmlBubbleRef = ref<any>(null);

function hasXmlTags(text: string): boolean {
  return /<([A-Za-z0-9_-]+)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/i.test(text);
}

function toggleAllTools(expand: boolean) {
  if (toolListRef.value?.setAllExpanded) {
    toolListRef.value.setAllExpanded(expand);
  }
}

function setTurnCollapsed(val: boolean) {
  isTurnCollapsed.value = val;
  // Also recursively collapse/expand inner tools & XML bubbles
  if (toolListRef.value?.setAllExpanded) {
    toolListRef.value.setAllExpanded(!val);
  }
  if (xmlBubbleRef.value?.setAllCollapsed) {
    xmlBubbleRef.value.setAllCollapsed(val);
  }
}

defineExpose({
  item: props.item,
  isTurnCollapsed,
  setTurnCollapsed,
});

function getRoleIcon(item: TimelineItem) {
  switch (item.type) {
    case 'user_input':
      return User;
    case 'model_response':
      return Bot;
    case 'tool_executions':
      return Wrench;
    case 'system_message':
      return AlertCircle;
    default:
      return Bot;
  }
}

function getRoleTitle(item: TimelineItem) {
  switch (item.type) {
    case 'user_input':
      return 'User';
    case 'model_response':
      return 'Assistant';
    case 'tool_executions':
      return 'Tool Activity';
    case 'system_message':
      return 'System';
    default:
      return 'Event';
  }
}

function getCollapsedSummary(item: TimelineItem): string {
  if (item.content) {
    return item.content.slice(0, 100).replace(/\n/g, ' ');
  }
  if (item.tools) {
    return item.tools.map(t => t.name).join(', ');
  }
  return '';
}
</script>
