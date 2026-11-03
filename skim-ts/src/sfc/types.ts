export type SfcBlockKind = 'script' | 'template' | 'style' | 'frontmatter';

export interface SfcBlock {
  tag: string;              // Verbatim header, e.g. '<script setup lang="ts">', '---', '<template>', '<style scoped>'
  name: string;             // Canonical name: 'script', 'script:setup', 'template', 'style', '---'
  kind: SfcBlockKind;
  lang: 'ts' | 'tsx' | 'js';
  startLine: number;
  endLine: number;
  startPos: number;
  endPos: number;
  contentStartPos: number;  // Inner content byte offset
  contentEndPos: number;    // Inner content byte offset
  isScript: boolean;        // True if script/frontmatter to be parsed by TS AST
  hideInGlance?: boolean;   // True if excluded from glance outline (e.g. Svelte/Astro markup)
}
