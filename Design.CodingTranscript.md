# Specification & Architecture: Coding Transcript (`coding-transcript`)

## Overview & Rationale

`coding-transcript` is a compile-to-single-HTML web application designed to visualize, inspect, and navigate conversation transcripts produced by coding agents and LLM tools.

### Rationale & Privacy Guarantee
Agent transcripts (such as `transcript.jsonl` or session logs) are valuable artifacts for post-mortems, pair-programming discussions, code reviews, and prompt engineering. However, raw JSON/JSONL files are tedious to read manually, and sharing sensitive conversation logs with third-party web services introduces privacy risks.

`coding-transcript` addresses this by compiling into a standalone, single-file HTML bundle (`dist/index.html`). All parsing, token calculation, and searching execute strictly client-side inside the user's browser: **nothing leaves the computer**. It can be hosted on a static server (e.g. Cloudflare Pages at `coding-transcript.encelerate.com`), accessed via `file://`, or distributed directly as an HTML file.

---

## Supported Platforms

- **Antigravity** (`transcript.jsonl`, `transcript_full.jsonl`): **Verified / Tested**. Full support for `USER_INPUT`, `PLANNER_RESPONSE` tool invocations paired with `GENERIC` outputs, thinking blocks, and token usage metrics.
- **OpenCode** (`*.json` session exports): **Verified / Tested**. Full support for multi-part messages, `reasoning` / thinking blocks, and `tool-invocation` / `tool-result` pairings.
- **Claude Code** (`*.jsonl`): **Experimental** (Untested). Translates `tool_use` and `tool_result` content blocks into the timeline model.
- **Standard Chat / OpenAI / AutoGen** (`*.json`, `*.jsonl`): **Experimental** (Untested). Supports standard `{ role, content }` structures.

---

## Architectural Design

The application separates platform-specific schemas from the user interface using a normalized intermediate representation:

```
[ Raw Transcript (JSON / JSONL) ]
               │
               ▼
   [ Platform Auto-Detection ]
               │
               ▼
     [ Platform Parser ]
  (Antigravity / OpenCode / ...)
               │
               ▼
     [ TimelineItem[] ]   <--- Universal Intermediate Model
               │
               ▼
[ Vue 3 UI (Timeline, XML Bubbles, Tools, Diff, Search) ]
```

### Universal Intermediate Model (`src/types.ts`)

- `TimelineItem`: Represents a conversational turn or event:
  - `id`: Unique identifier for DOM anchors and search targeting.
  - `type`: `'user_input' | 'tool_executions' | 'model_response' | 'system_message'`.
  - `stepIndex`: Sequential turn or step index.
  - `createdAt`: ISO 8601 timestamp string.
  - `content`: Primary Markdown or text body.
  - `thinking`: Model reasoning/thinking text (when available).
  - `media`: Array of attached media (`{ mime_type, uri }`).
  - `tools`: Array of `ToolExecutionItem` records.
  - `tokens`: Turn token metrics (`input`, `output`, `cacheRead`).
- `ToolExecutionItem`:
  - `name`: Tool identifier (e.g. `run_command`, `read_file`, `edit_file`).
  - `args`: Arguments object passed to the tool.
  - `summaryText`: Condensed one-line description for the collapsed header.
  - `outputContent`: Output or return stdout/stderr from the tool execution.
  - `status`: Execution outcome status (`DONE`, `ERROR`, etc.).

---

## Platform Parsers & Auto-Detection (`src/parsers/`)

Each platform parser implements the `PlatformParser` interface defined in `src/parsers/types.ts`:

- `id`: Unique platform identifier string.
- `name`: Human-readable label displayed in badges and dropdowns.
- `badgeClass`: Tailwind border and text classes for UI badges.
- `detect(rawText: string, sampleRecords: any[]): boolean`: Returns true if the transcript matches this platform's fingerprint.
- `parse(rawText: string): ParseResult`: Parses the text and returns normalized `TimelineItem[]` and metadata.

### Auto-Detection Logic (`src/parsers/index.ts`)
When a file is loaded with platform set to `auto`:
1. The engine attempts to parse the payload as JSON or extracts the first few lines as JSON records.
2. Each registered parser is queried via `detect()`.
3. If a parser matches, its `parse()` routine runs.
4. If no specific signature matches, the system falls back to `antigravityParser` (which handles generic JSONL sequences safely).

---

## File & Component Structure

- `coding-transcript/`: Root of the transcript viewer module.
  - `fixtures/`: Sample transcripts used for verification and regression checks.
    - `audigma.antigravity.jsonl`: Real-world Antigravity transcript fixture.
    - `audigma.opencode.json`: Real-world OpenCode session export fixture.
  - `dist/`: Build output directory (gitignored). Contains `index.html`.
  - `src/`: Source code.
    - `main.ts`: Application entry point; mounts Vue and imports CSS.
    - `style.css`: Theme CSS custom properties (`--bg-primary`, `--border-color`, etc.), Prism syntax styling, and Markdown prose rules.
    - `types.ts`: Core data models (`TimelineItem`, `ToolExecutionItem`, `SearchMatch`).
    - `App.vue`: Main layout container; manages active transcript, theme switching, global expand/collapse orchestration, and search coordination.
    - `components/`: UI components.
      - `UploadView.vue`: Initial landing view with tabs for drag-and-drop file upload vs raw text pasting, plus manual platform selector.
      - `TimelineTurnCard.vue`: Renders an individual conversation turn card with collapsible header, token stats, and body routing.
      - `XmlBubbleView.vue`: Parses and renders XML-like tags (e.g. `<USER_REQUEST>`, `<ADDITIONAL_METADATA>`, `<SKILL>`) as collapsible blocks.
      - `ToolCallsList.vue`: Batched tool executions with side-by-side diff previews for file edits, terminal-style command bars, and expandable stdout.
      - `SearchBar.vue`: Sticky top search bar with match counter, keyboard navigation (`Enter` / `Shift+Enter`), and scope filters.
    - `parsers/`: Platform adapter modules.
      - `types.ts`: `PlatformParser`, `ParseResult`, and `PlatformInfo` interfaces.
      - `index.ts`: Registry and auto-detection dispatcher.
      - `antigravity.ts`: Parser for Antigravity JSONL logs.
      - `opencode.ts`: Parser for OpenCode JSON logs.
      - `claude-code.ts`: Parser for Claude Code JSONL logs (Experimental).
      - `standard-chat.ts`: Parser for OpenAI / AutoGen messages (Experimental).
    - `utils/`: Shared utilities.
      - `markdown.ts`: Marked + Prism integration for GFM Markdown parsing and code block highlighting.
      - `search.ts`: Search engine scanning prompts, responses, tool inputs, and tool outputs with snippet extraction.
      - `xmlParser.ts`: Regex parser decomposing structured tag blocks from plain text.
  - `package.json`: Project metadata and build scripts (`dev`, `build`, `preview`).
  - `vite.config.ts`: Vite configuration utilizing `@tailwindcss/vite` and `vite-plugin-singlefile`.
  - `tsconfig.json`: TypeScript configuration.
  - `index.html`: Vite HTML template with `#app` mount point.
  - `README.md`: End-user documentation and usage instructions.

---

## UI & Theme Design System

- **Pure Black / Pure White Backgrounds**:
  - Dark mode: Background `#000000`, card surfaces `#050505`, headers `#0d0d0d`.
  - Light mode: Background `#ffffff`, card surfaces `#ffffff`, headers `#f8fafc`.
- **Border-Driven Contrast**: No high-intensity glow or heavy colored backgrounds. Cards and badges use borders (`#262626` / `#e2e8f0`) and subtle shadows.
- **Deep Hierarchical Collapsibility**:
  - Turn level: Entire turns collapse into a single-line summary with step number and timestamp.
  - Message level: XML tag blocks collapse into single-line pills showing tag name, truncated text preview, and character count.
  - Tool level: Individual tool calls and outputs can be expanded or collapsed independently.
  - Global toggle: Top navbar "Collapse all / Expand all" cascades recursively down through all levels.

---

## Verification & Testing

Sample fixtures in `fixtures/` are used to verify parsing and rendering:
- `audigma.antigravity.jsonl`: Verifies tool-result pairing, token summation, and XML bubble generation.
- `audigma.opencode.json`: Verifies parsing of multi-part reasoning blocks, tool invocations, and text blocks.
Formal automated test suites against these fixtures are planned for future iterations.
