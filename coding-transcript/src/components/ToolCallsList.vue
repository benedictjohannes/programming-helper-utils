<template>
  <div class="space-y-1.5">
    <div
      v-for="tool in tools"
      :key="tool.id"
      :id="tool.id"
      class="border border-[var(--border-color)] rounded-lg bg-[var(--bg-card)] overflow-hidden transition"
    >
      <!-- Tool Header -->
      <div
        @click="toggleExpand(tool.id)"
        class="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-header)] hover:bg-[var(--bg-hover)] cursor-pointer select-none border-b border-[var(--border-color)]"
      >
        <div class="flex items-center gap-2 min-w-0">
          <ChevronRight
            class="w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-150 shrink-0"
            :class="{ 'rotate-90': isExpanded(tool.id) }"
          />

          <!-- Tool Name Badge -->
          <span
            class="px-1.5 py-0.5 rounded text-[11px] font-mono font-medium flex items-center gap-1 shrink-0 border border-[var(--border-color)] text-[var(--text-primary)]"
          >
            <component :is="getToolIcon(tool.name)" class="w-3 h-3 text-[var(--text-muted)]" />
            <span>{{ tool.name }}</span>
          </span>

          <!-- Tool Summary -->
          <span class="text-xs font-mono text-[var(--text-secondary)] truncate" :title="tool.summaryText">
            {{ tool.summaryText }}
          </span>
        </div>

        <div class="flex items-center gap-2 text-xs shrink-0">
          <span
            v-if="tool.status"
            class="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border border-[var(--border-color)] text-[var(--text-secondary)]"
          >
            {{ tool.status }}
          </span>
          <span class="text-[11px] font-mono text-[var(--text-muted)]">#{{ tool.stepIndexCall }}</span>
        </div>
      </div>

      <!-- Tool Body -->
      <div v-show="isExpanded(tool.id)" class="p-3 space-y-3 bg-[var(--bg-primary)]">
        <!-- Thinking section if present on this specific tool call -->
        <ReasoningBubble
          v-if="tool.thinking"
          :content="tool.thinking"
          :defaultExpanded="true"
        />

        <!-- Input section -->
        <div>
          <div class="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span class="uppercase tracking-wider text-[10px] font-semibold">Input</span>
            <button
              @click.stop="copyText(JSON.stringify(tool.args, null, 2))"
              class="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
            >
              <Copy class="w-3 h-3" />
              <span>Copy</span>
            </button>
          </div>

          <!-- 1. Normalized File Operation preview -->
          <div v-if="tool.fileOperation" class="space-y-1.5">
            <div class="text-xs text-[var(--text-secondary)] font-mono">
              File: <span class="text-[var(--text-primary)] font-medium">{{ tool.fileOperation.path }}</span>
            </div>

            <!-- Side-by-side Target vs Replacement diff (edit) -->
            <div
              v-if="tool.fileOperation.type === 'edit' && tool.fileOperation.target !== undefined && tool.fileOperation.replacement !== undefined"
              class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono"
            >
              <div class="border border-[var(--border-color)] rounded-md p-2 bg-[var(--bg-card)]">
                <div class="text-[10px] uppercase font-bold text-red-500 mb-1">Target (Replaced)</div>
                <pre class="overflow-x-auto text-[var(--text-primary)] whitespace-pre-wrap">{{ tool.fileOperation.target }}</pre>
              </div>
              <div class="border border-[var(--border-color)] rounded-md p-2 bg-[var(--bg-card)]">
                <div class="text-[10px] uppercase font-bold text-emerald-500 mb-1">Replacement</div>
                <pre class="overflow-x-auto text-[var(--text-primary)] whitespace-pre-wrap">{{ tool.fileOperation.replacement || '(Deleted)' }}</pre>
              </div>
            </div>

            <!-- Unified patch / diff view (edit) -->
            <div
              v-else-if="tool.fileOperation.type === 'edit' && tool.fileOperation.diffText"
              class="border border-[var(--border-color)] bg-[var(--code-bg)] rounded-md p-2.5 font-mono text-xs overflow-x-auto"
            >
              <pre class="whitespace-pre-wrap text-[var(--text-primary)]">{{ tool.fileOperation.diffText }}</pre>
            </div>

            <!-- Write File Content view (write) -->
            <div
              v-else-if="tool.fileOperation.type === 'write'"
              class="border border-[var(--border-color)] bg-[var(--code-bg)] rounded-md overflow-hidden"
            >
              <div class="px-2.5 py-1 text-[10px] uppercase font-bold text-emerald-500 bg-[var(--bg-card)] border-b border-[var(--border-color)]">
                Content Written
              </div>
              <pre class="p-2.5 text-xs font-mono text-[var(--text-primary)] overflow-x-auto max-h-72 whitespace-pre-wrap">{{ tool.fileOperation.content || '(Empty file)' }}</pre>
            </div>
          </div>

          <!-- Fallback diff preview for unparsed edit_file args -->
          <div v-else-if="tool.name === 'edit_file' && tool.args.Target && tool.args.Replacement !== undefined" class="space-y-1.5">
            <div class="text-xs text-[var(--text-secondary)] font-mono">File: <span class="text-[var(--text-primary)]">{{ tool.args.Path }}</span></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
              <div class="border border-[var(--border-color)] rounded-md p-2 bg-[var(--bg-card)]">
                <div class="text-[10px] uppercase font-bold text-red-500 mb-1">Target (Replaced)</div>
                <pre class="overflow-x-auto text-[var(--text-primary)] whitespace-pre-wrap">{{ tool.args.Target }}</pre>
              </div>
              <div class="border border-[var(--border-color)] rounded-md p-2 bg-[var(--bg-card)]">
                <div class="text-[10px] uppercase font-bold text-emerald-500 mb-1">Replacement</div>
                <pre class="overflow-x-auto text-[var(--text-primary)] whitespace-pre-wrap">{{ tool.args.Replacement || '(Deleted)' }}</pre>
              </div>
            </div>
          </div>

          <!-- Command line for run_command -->
          <div v-else-if="tool.name === 'run_command' && tool.args.CommandLine">
            <div class="border border-[var(--border-color)] bg-[var(--code-bg)] rounded-md p-2 font-mono text-xs text-[var(--text-primary)] overflow-x-auto flex items-start gap-2">
              <span class="text-[var(--text-muted)] select-none">$</span>
              <span class="whitespace-pre-wrap">{{ tool.args.CommandLine }}</span>
            </div>
          </div>

          <!-- General JSON args -->
          <div v-else>
            <pre class="language-json rounded-md text-xs overflow-x-auto"><code class="language-json" v-html="highlightCode(JSON.stringify(tool.args, null, 2), 'json')"></code></pre>
          </div>
        </div>

        <!-- Output section -->
        <div v-if="tool.outputContent !== undefined">
          <div class="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span class="uppercase tracking-wider text-[10px] font-semibold">Output</span>
            <div class="flex items-center gap-2">
              <span v-if="tool.stepIndexResult" class="text-[10px] font-mono text-[var(--text-muted)]">step #{{ tool.stepIndexResult }}</span>
              <button
                @click.stop="copyText(tool.outputContent)"
                class="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
              >
                <Copy class="w-3 h-3" />
                <span>Copy</span>
              </button>
            </div>
          </div>

          <div class="border border-[var(--border-color)] bg-[var(--code-bg)] rounded-md overflow-hidden">
            <pre class="p-2.5 text-xs font-mono text-[var(--text-primary)] overflow-x-auto max-h-80 whitespace-pre-wrap">{{ tool.outputContent || '(Empty output)' }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { ToolCallItem } from '../types';
import { highlightCode } from '../utils/markdown';
import ReasoningBubble from './ReasoningBubble.vue';
import {
  ChevronRight,
  Terminal,
  FileCode,
  FileEdit,
  FilePlus,
  Search,
  Cpu,
  Copy
} from 'lucide-vue-next';

const props = defineProps<{
  tools: ToolCallItem[];
}>();

const expandedMap = ref<Record<string, boolean>>({});

// Auto expand if error
props.tools.forEach(tool => {
  if (tool.status === 'ERROR') {
    expandedMap.value[tool.id] = true;
  }
});

function isExpanded(id: string) {
  return !!expandedMap.value[id];
}

function toggleExpand(id: string) {
  expandedMap.value[id] = !expandedMap.value[id];
}

function setAllExpanded(expand: boolean) {
  for (const t of props.tools) {
    expandedMap.value[t.id] = expand;
  }
}

function setToolExpanded(id: string, expand: boolean = true) {
  expandedMap.value[id] = expand;
}

defineExpose({
  tools: props.tools,
  expandedMap,
  setAllExpanded,
  setToolExpanded,
});

function getToolIcon(name: string) {
  switch (name) {
    case 'run_command':
    case 'shell':
    case 'bash':
      return Terminal;
    case 'read_file':
    case 'read':
      return FileCode;
    case 'edit_file':
    case 'edit':
    case 'patch':
      return FileEdit;
    case 'write_file':
    case 'write':
      return FilePlus;
    case 'search_web':
    case 'grep':
    case 'glob':
      return Search;
    default:
      return Cpu;
  }
}

async function copyText(str: string) {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API unavailable');
    }
    await navigator.clipboard.writeText(str);
  } catch (err) {
    console.error('Copy failed: ', err);
    alert('Copy failed, this is an irrecoverable error most likely caused by accessing through insecure http:// protocol');
  }
}
</script>
