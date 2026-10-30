<template>
  <div class="flex flex-col items-center justify-center min-h-[70vh] p-6 max-w-4xl mx-auto w-full">
    <!-- View Mode 1: Export Guide -->
    <ExportGuideView
      v-if="currentView === 'guide'"
      @back="currentView = 'upload'"
    />

    <!-- View Mode 2: Welcome / Upload Form -->
    <template v-else>
      <!-- Header Hero -->
      <div class="text-center mb-6">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] mb-3">
          <Sparkles class="w-6 h-6" />
        </div>
        <h1 class="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">Universal Transcript Viewer</h1>
        <p class="mt-1 text-[var(--text-muted)] text-xs max-w-md mx-auto">
          Inspect, search, and navigate AI agent transcripts with collapsible cards, diff views, and code syntax highlighting.
        </p>
      </div>

      <!-- Mode Selector Tabs & Platform selector -->
      <div class="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 space-y-4">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
          <!-- Tab buttons -->
          <div class="flex p-1 space-x-1 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] w-full sm:w-auto">
            <button
              @click="activeTab = 'file'"
              :class="[
                'flex-1 sm:flex-none py-1.5 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition cursor-pointer',
                activeTab === 'file'
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              ]"
            >
              <UploadCloud class="w-3.5 h-3.5" />
              <span>File Upload / DnD</span>
            </button>

            <button
              @click="activeTab = 'paste'"
              :class="[
                'flex-1 sm:flex-none py-1.5 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition cursor-pointer',
                activeTab === 'paste'
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              ]"
            >
              <ClipboardPaste class="w-3.5 h-3.5" />
              <span>Paste Transcript</span>
            </button>
          </div>

          <!-- Platform Format Override -->
          <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span class="text-xs text-[var(--text-muted)]">Platform:</span>
            <select
              v-model="selectedPlatform"
              class="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-subtle)] cursor-pointer"
            >
              <option value="auto">Auto-Detect</option>
              <option v-for="p in registeredParsers" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Tab 1: File Upload / Drag & Drop -->
        <div v-if="activeTab === 'file'" class="p-2 space-y-3">
          <div
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
            :class="[
              'border-2 border-dashed rounded-lg p-8 text-center transition flex flex-col items-center justify-center gap-3 cursor-pointer',
              isDragging
                ? 'border-[var(--text-primary)] bg-[var(--bg-hover)]'
                : 'border-[var(--border-color)] hover:border-[var(--border-subtle)] bg-[var(--bg-primary)]'
            ]"
            @click="triggerFileInput"
          >
            <input
              ref="fileInputRef"
              type="file"
              accept=".jsonl,.json,.txt"
              class="hidden"
              @change="handleFileSelected"
            />

            <div class="w-10 h-10 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-center text-[var(--text-secondary)]">
              <FileText class="w-5 h-5 text-[var(--text-muted)]" />
            </div>

            <div>
              <p class="text-sm font-medium text-[var(--text-primary)]">
                Drop transcript file or click to browse
              </p>
              <p class="text-xs text-[var(--text-muted)] mt-0.5">Supports JSONL, JSON records, or raw conversation logs</p>
            </div>

            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition cursor-pointer"
            >
              Select File
            </button>
          </div>

          <!-- Subtle Helper: Export Guide Link -->
          <div class="flex items-center justify-center pt-1 text-xs text-[var(--text-muted)]">
            <span>Don't have your transcript file yet?</span>
            <button
              type="button"
              @click="currentView = 'guide'"
              class="ml-1.5 font-medium text-[var(--text-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle class="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>Export Guide</span>
            </button>
          </div>
        </div>

        <!-- Tab 2: Paste Raw JSONL -->
        <div v-if="activeTab === 'paste'" class="p-2 space-y-3">
          <div class="relative">
            <textarea
              v-model="pastedText"
              rows="10"
              placeholder="Paste raw transcript JSONL or JSON content here..."
              class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3 font-mono text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-subtle)] resize-y"
            ></textarea>
            <div v-if="pastedText.trim()" class="absolute bottom-2.5 right-2.5 text-[11px] text-[var(--text-muted)] bg-[var(--bg-card)] px-2 py-0.5 rounded border border-[var(--border-color)]">
              {{ pastedLineCount }} lines
            </div>
          </div>

          <div class="flex justify-between items-center">
            <div class="flex items-center gap-3">
              <button
                v-if="pastedText.trim()"
                @click="pastedText = ''"
                type="button"
                class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Clear Text
              </button>
              <button
                type="button"
                @click="currentView = 'guide'"
                class="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 transition cursor-pointer"
              >
                <HelpCircle class="w-3.5 h-3.5" />
                <span>Export Guide</span>
              </button>
            </div>

            <button
              @click="loadFromPaste"
              :disabled="!pastedText.trim()"
              type="button"
              class="px-4 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 cursor-pointer"
            >
              <Play class="w-3.5 h-3.5 fill-current" />
              <span>Load Transcript</span>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { UploadCloud, ClipboardPaste, FileText, Play, Sparkles, HelpCircle } from 'lucide-vue-next';
import { registeredParsers } from '../parsers';
import ExportGuideView from './ExportGuideView.vue';

const emit = defineEmits<{
  (e: 'load', content: string, filename?: string, forcedPlatform?: string): void;
}>();

const currentView = ref<'upload' | 'guide'>('upload');
const activeTab = ref<'file' | 'paste'>('file');
const selectedPlatform = ref<string>('auto');
const isDragging = ref(false);
const pastedText = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);

const pastedLineCount = computed(() => {
  if (!pastedText.value.trim()) return 0;
  return pastedText.value.trim().split('\n').filter(Boolean).length;
});

function triggerFileInput() {
  fileInputRef.value?.click();
}

function handleFileSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    readFile(target.files[0]);
  }
}

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    readFile(e.dataTransfer.files[0]);
  }
}

function readFile(file: File) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target?.result as string;
    if (content) {
      emit('load', content, file.name, selectedPlatform.value);
    }
  };
  reader.readAsText(file);
}

function loadFromPaste() {
  if (pastedText.value.trim()) {
    emit('load', pastedText.value.trim(), 'pasted-transcript.jsonl', selectedPlatform.value);
  }
}
</script>
