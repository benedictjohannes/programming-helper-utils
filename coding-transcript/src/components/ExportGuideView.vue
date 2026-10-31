<template>
  <div class="w-full max-w-4xl mx-auto space-y-6 py-2">
    <!-- Top Bar: Back icon + Title -->
    <div class="flex items-center gap-3 pb-3 border-b border-[var(--border-color)]">
      <button
        @click="$emit('back')"
        class="p-1.5 rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
        title="Back to Upload"
        aria-label="Back to Upload"
      >
        <ArrowLeft class="w-4 h-4" />
      </button>
      <h2 class="text-base sm:text-lg font-bold text-[var(--text-primary)] tracking-tight">
        Transcript Export Guide
      </h2>
    </div>

    <!-- Platform Switcher: Dedicated bar below the top bar -->
    <div class="flex p-1 space-x-1 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] w-full sm:w-fit">
      <button
        @click="selectedPlatform = 'opencode'"
        :class="[
          'flex-1 sm:flex-none py-1.5 px-4 text-xs font-medium rounded-md transition cursor-pointer text-center',
          selectedPlatform === 'opencode'
            ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] font-semibold shadow-sm'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
        ]"
      >
        OpenCode
      </button>
      <button
        @click="selectedPlatform = 'antigravity'"
        :class="[
          'flex-1 sm:flex-none py-1.5 px-4 text-xs font-medium rounded-md transition cursor-pointer text-center',
          selectedPlatform === 'antigravity'
            ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] font-semibold shadow-sm'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
        ]"
      >
        Antigravity
      </button>
    </div>

    <!-- Content 1: OpenCode -->
    <div v-if="selectedPlatform === 'opencode'" class="space-y-6">
      <div class="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 space-y-4">
        <div class="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Terminal class="w-4 h-4 text-emerald-400" />
          <span>Option 1: OpenCode TUI (Terminal)</span>
        </div>
        <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
          OpenCode includes a built-in export command directly within its interactive terminal interface.
        </p>

        <ol class="list-decimal list-inside space-y-2 text-xs text-[var(--text-secondary)]">
          <li>
            In the TUI chat prompt, type <code class="px-1.5 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono text-[var(--text-primary)]">/export</code> and press <kbd class="px-1 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono">Enter</kbd>.
          </li>
          <li>
            In the popup modal, select <strong>JSON</strong> format.
          </li>
          <li>
            Navigate with <kbd class="px-1 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono">Tab</kbd> to your preferred action:
            <ul class="list-disc list-inside mt-2 ml-4 space-y-1.5 text-[var(--text-muted)]">
              <li>
                <strong class="text-[var(--text-primary)]">Export to File:</strong> Focus on <strong>Export</strong> and press Enter. The dialog displays the file path. Drop that exported <code class="font-mono text-[var(--text-primary)]">*.json</code> file into the viewer.
              </li>
              <li>
                <strong class="text-[var(--text-primary)]">Copy to Clipboard:</strong> Focus on <strong>Copy</strong> and press Enter. The raw JSON transcript is copied to your clipboard. Switch to the <strong>Paste Transcript</strong> tab here and paste (<kbd class="px-1 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono">Ctrl+V</kbd> / <kbd class="px-1 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono">Cmd+V</kbd>).
              </li>
            </ul>
          </li>
        </ol>
      </div>

      <div class="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 space-y-3">
        <div class="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Globe class="w-4 h-4 text-sky-400" />
          <span>Option 2: OpenCode Web UI</span>
        </div>
        <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
          When using an active OpenCode web browser session:
        </p>
        <ol class="list-decimal list-inside space-y-1.5 text-xs text-[var(--text-secondary)]">
          <li>
            In the chat prompt, type <code class="px-1.5 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono text-[var(--text-primary)]">/export</code> and press Enter.
          </li>
          <li>
            The transcript session file is downloaded directly by your web browser (check your system Downloads folder).
          </li>
          <li>
            Drag and drop the downloaded JSON file into the <strong>File Upload</strong> area.
          </li>
        </ol>
      </div>
    </div>

    <!-- Content 2: Antigravity -->
    <div v-if="selectedPlatform === 'antigravity'" class="space-y-6">
      <!-- Method 1: Prompt Assistant Directly -->
      <div class="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <MessageSquare class="w-4 h-4 text-amber-400" />
            <span>Method 1: Ask the Assistant Directly (No Setup)</span>
          </div>
          <span class="text-[11px] leading-none px-2 py-0.5 rounded-full bg-[var(--bg-header)] text-[var(--text-primary)] border border-[var(--border-color)] inline-flex items-center gap-1.5 shadow-xs">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 translate-y-[0.5px]"></span>
            <span>Recommended</span>
          </span>
        </div>

        <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
          Antigravity records full JSONL logs in its internal conversation store. Because directory layouts vary across platforms, the easiest way is to ask your assistant in the chat:
        </p>

        <div class="relative bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3">
          <pre class="font-mono text-xs text-[var(--text-primary)] select-all whitespace-pre-wrap">{{ promptSnippet }}</pre>
          <button
            @click="copyText(promptSnippet, 'prompt')"
            class="absolute top-2.5 right-2.5 px-2.5 py-1 text-[11px] rounded border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition flex items-center gap-1 cursor-pointer"
          >
            <Check v-if="copiedPrompt" class="w-3 h-3 text-emerald-400" />
            <Copy v-else class="w-3 h-3" />
            <span>{{ copiedPrompt ? 'Copied' : 'Copy Prompt' }}</span>
          </button>
        </div>

        <p class="text-[11px] text-[var(--text-muted)]">
          The assistant will return the clickable link or file path to <code class="font-mono text-[var(--text-secondary)]">transcript.jsonl</code>. You can drop that file into the viewer or paste its content.
        </p>
      </div>

      <!-- Method 2: Custom Skill Workflow Template -->
      <div class="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <FileCode class="w-4 h-4 text-purple-400" />
            <span>Method 2: Install as Skill / Workflow</span>
          </div>
          <span class="text-[11px] leading-none px-2 py-0.5 rounded-full bg-[var(--bg-header)] text-[var(--text-primary)] border border-[var(--border-color)] inline-flex items-center gap-1.5 shadow-xs">
            <span class="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0 translate-y-[0.5px]"></span>
            <span>Power Users</span>
          </span>
        </div>

        <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
          You can install this as an Antigravity skill/workflow, or prompt Antigravity to install it for you so you can access it anytime via <code class="px-1.5 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] font-mono text-[var(--text-primary)]">/export-transcript</code>.
        </p>

        <div class="relative bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3">
          <div class="flex justify-between items-center mb-2 pb-2 border-b border-[var(--border-color)]">
            <span class="text-[11px] font-mono text-[var(--text-muted)]">SKILL.md (export-transcript)</span>
            <button
              @click="copyText(skillTemplate, 'skill')"
              class="px-2.5 py-1 text-[11px] rounded border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition flex items-center gap-1 cursor-pointer"
            >
              <Check v-if="copiedSkill" class="w-3 h-3 text-emerald-400" />
              <Copy v-else class="w-3 h-3" />
              <span>{{ copiedSkill ? 'Copied Template' : 'Copy Template' }}</span>
            </button>
          </div>
          <pre class="font-mono text-xs text-[var(--text-secondary)] overflow-x-auto max-h-72 select-all whitespace-pre leading-relaxed">{{ skillTemplate }}</pre>
        </div>
      </div>
    </div>

    <!-- Bottom navigation footer -->
    <div class="pt-2 flex justify-start">
      <button
        @click="$emit('back')"
        class="px-3.5 py-1.5 rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-xs font-medium text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer"
      >
        <ArrowLeft class="w-3.5 h-3.5" />
        <span>Back to Upload</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ArrowLeft, Terminal, Globe, MessageSquare, FileCode, Copy, Check } from 'lucide-vue-next';
import skillTemplateRaw from '../assets/antigravity-export-skill.md?raw';

defineEmits<{
  (e: 'back'): void;
}>();

const selectedPlatform = ref<'opencode' | 'antigravity'>('opencode');
const skillTemplate = skillTemplateRaw;
const promptSnippet = `Please show me the path to this conversation's full JSONL transcript.`;

const copiedPrompt = ref(false);
const copiedSkill = ref(false);

async function copyText(text: string, type: 'prompt' | 'skill') {
  try {
    await navigator.clipboard.writeText(text);
    if (type === 'prompt') {
      copiedPrompt.value = true;
      setTimeout(() => (copiedPrompt.value = false), 2000);
    } else {
      copiedSkill.value = true;
      setTimeout(() => (copiedSkill.value = false), 2000);
    }
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
}
</script>