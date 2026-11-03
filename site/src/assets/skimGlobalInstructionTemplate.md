# Exploring Code Efficiently with skim-*
For py, go, rs, and TypeScript family (ts, tsx, js, jsx, mts, vue, svelte, astro), prefer `skim-py`, `skim-go`, `skim-rs`, and `skim-ts` over fully reading files or blind grep:

- `skim-<lang> glance [options] <path>...`: Outline files/directories without reading full bodies.
  - -s: Show declarations & return types (omits function/method bodies).
  - -d: Expand struct fields, interface members, enum variants, and class properties.
  - -u: List top-level imports / use statements.
  - -f <text>: Case-insensitive keyword filter (repeatable for AND match).
  - -t: Include test files and test blocks (excluded by default).

- `skim-<lang> block [options] <file> <target>`: Extract verbatim code block with line gutters.
  - Target format: Standalone name or qualified member (Type.Method / Type::method).
  - --raw: Print without line number gutters (for clean copy & tool edit targeting).
  - -t: Search within test files/blocks.

Recommended Workflow:
1. `skim-<lang> glance <path> -s` (optionally `-f <keyword>`) to locate relevant types/functions.
2. `skim-<lang> block <file> <target>` to inspect only the required function or struct.
