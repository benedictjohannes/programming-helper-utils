---
name: export-transcript
description: Resolves conversation transcript JSONL path, copies its path or contents to the clipboard for viewing in the transcript viewer SPA. Supports active or arbitrary cross-project conversation IDs.
---

# Export Transcript Skill

Use this skill when the user requests to export a conversation transcript (e.g., `/export-transcript`, `/export-transcript copy`, `/export-transcript copy path`, or specifying an arbitrary conversation ID).

## Locating Transcripts

All Antigravity conversations across all projects store artifacts and transcript logs in a unified global directory:
- `<appDataDir>/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`
- `<appDataDir>/brain/<conversation-id>/.system_generated/logs/transcript_full.jsonl` (contains untruncated entries)

Default `<appDataDir>`: `~/.gemini/antigravity-cli/`

### Target Conversation ID Resolution
1. **Active Session**: Use the current session's `<conversation-id>`.
2. **Explicit Arbitrary ID** (e.g. `f1c8534d-6829-46bf-898e-2ddb9298acdc`):
   - Access directly at `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`.
   - Optionally inspect conversation title, project workspace, and date via SQLite metadata:
     ```bash
     sqlite3 ~/.gemini/antigravity-cli/conversation_summaries.db \
       "SELECT conversation_id, title, workspace_uris, datetime(last_modified_time) FROM conversation_summaries WHERE conversation_id='<conversation-id>';"
     ```

## Actions

### 1. Show Path (`/export-transcript [id]`)
Return clickable file links to both the compact and full transcripts along with the conversation title/project metadata if available:
- [transcript.jsonl](file://<appDataDir>/brain/<conversation-id>/.system_generated/logs/transcript.jsonl)
- [transcript_full.jsonl](file://<appDataDir>/brain/<conversation-id>/.system_generated/logs/transcript_full.jsonl)

### 2. Copy Path to Clipboard (`/export-transcript copy path [id]`)
Copy the absolute path of the target transcript file (`transcript.jsonl`) to the clipboard instead of its entire content.

- **KDE Plasma / Klipper (Wayland/X11)**:
  ```bash
  busctl --user call org.kde.klipper /klipper org.kde.klipper.klipper setClipboardContents s "<path-to-transcript.jsonl>"
  ```
- **Wayland (wl-clipboard)**:
  ```bash
  printf "%s" "<path-to-transcript.jsonl>" | wl-copy
  ```
- **macOS**:
  ```bash
  printf "%s" "<path-to-transcript.jsonl>" | pbcopy
  ```
- **X11 (xclip / xsel)**:
  ```bash
  printf "%s" "<path-to-transcript.jsonl>" | xclip -selection clipboard
  ```
- **Windows / WSL**:
  ```bash
  printf "%s" "<path-to-transcript.jsonl>" | clip.exe
  ```

Confirm that the path was copied to clipboard, and display clickable links to both files as reference.

### 3. Copy File Contents to Clipboard (`/export-transcript copy [id]`)
Execute an inline one-liner to pipe the target transcript file content into the clipboard:

- **KDE Plasma / Klipper (Wayland/X11)**:
  ```bash
  busctl --user call org.kde.klipper /klipper org.kde.klipper.klipper setClipboardContents s "$(< <path-to-transcript.jsonl>)"
  ```
- **Wayland (wl-clipboard)**:
  ```bash
  wl-copy < <path-to-transcript.jsonl>
  ```
- **macOS**:
  ```bash
  pbcopy < <path-to-transcript.jsonl>
  ```
- **X11 (xclip / xsel)**:
  ```bash
  xclip -selection clipboard < <path-to-transcript.jsonl>
  ```
- **Windows / WSL**:
  ```bash
  clip.exe < <path-to-transcript.jsonl>
  ```

If the clipboard operation succeeds, report lines and byte size copied. If it fails or clipboard tools are missing, fall back to outputting the file path.
