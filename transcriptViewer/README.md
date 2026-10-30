# Universal Transcript Viewer

A lightweight, standalone, single-file HTML viewer for AI agent conversation transcripts across multiple platforms.

Transcripts are valuable records to review with team members for prompt refinement, debugging, and post-mortems. This tool allows viewing and sharing transcripts easily while keeping data secure: **everything runs strictly client-side inside the browser—nothing leaves your computer**.

## Supported Platforms

- **Antigravity** (`transcript.jsonl` & `transcript_full.jsonl`): Fully tested.
- **OpenCode** (`*.json` session exports): Fully tested.
- **Claude Code** (`*.jsonl`): Experimental.
- **Standard Chat / OpenAI / AutoGen** (`*.json`, `*.jsonl`): Experimental.

## Key Features

- **Single HTML Distribution**: Compiles JavaScript, CSS, icons, and syntax rules into a single `dist/index.html` file with zero external runtime or CDN dependencies.
- **Client-Side Privacy**: All parsing, rendering, and searching happen locally inside your browser. No transcripts are uploaded anywhere.
- **Flexible Ingestion**:
  - Drag-and-drop or file picker for JSON / JSONL files.
  - Paste tab with real-time line detection for direct clipboard imports.
  - Automatic platform detection with manual override option.
- **Recursive Collapsibility**:
  - Collapse or expand entire conversation turns.
  - Deep collapse down through XML tag bubbles (`<USER_REQUEST>`, `<ADDITIONAL_METADATA>`, etc.) and individual tool executions.
  - Global "Collapse all / Expand all" controls in the top bar.
- **Code & Diff Visualization**:
  - Side-by-side Target vs. Replacement diffs for file edits.
  - Terminal-style command line rendering for shell operations.
  - Syntax highlighting for Bash, TypeScript, JavaScript, Python, Go, Rust, JSON, YAML, and Markdown.
- **Full-Text Search & Navigation**:
  - Real-time search across user prompts, assistant text, tool inputs, and tool outputs.
  - Match cycling with `Enter` (next) and `Shift+Enter` (previous), smooth scrolling, and flash highlighting.
  - Scope filter buttons to narrow search targets.
- **Themes**:
  - Pure Black dark mode (`#000000`) and pure White light mode (`#ffffff`) with border-driven contrast.

## Building

Prerequisites: [Bun](https://bun.sh/) (or Node.js 18+).

```bash
cd transcriptViewer
bun install
bun run build
```

The compiled standalone viewer will be output at:
```
transcriptViewer/dist/index.html
```

You can open this file directly in any modern browser via `file://`, double-click it, or host it on any static web server.

## Development

To run the local development server with hot reload:

```bash
bun run dev
```

## Developer Specification

For detailed architectural specifications, intermediate data models, and parser development guidelines, see [Design.TranscriptViewer.md](../Design.TranscriptViewer.md).
