import { describe, it, expect } from "bun:test";
import * as path from "node:path";
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import { extractVueBlocks } from "../src/sfc/vue.js";
import { extractSvelteBlocks } from "../src/sfc/svelte.js";
import { extractAstroBlocks } from "../src/sfc/astro.js";
import { maskSfc } from "../src/sfc/mask.js";

const CLI_PATH = path.resolve(__dirname, "../skim-ts");
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/sfc");

function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
  const proc = spawnSync(CLI_PATH, args, {
    encoding: "utf-8",
    env: { ...process.env },
  });
  return {
    stdout: proc.stdout || "",
    stderr: proc.stderr || "",
    status: proc.status ?? 0,
  };
}

describe("SFC: Extraction Accuracy", () => {
  it("correctly extracts blocks from Vue dual-script SFC", () => {
    const vueFile = path.join(FIXTURES_DIR, "vue-dual-script.vue");
    const content = fs.readFileSync(vueFile, "utf-8");
    const blocks = extractVueBlocks(content);

    expect(blocks.length).toBe(5);
    expect(blocks[0]!.kind).toBe("script");
    expect(blocks[0]!.tag).toBe('<script lang="ts">');
    expect(blocks[0]!.name).toBe("script");
    expect(blocks[0]!.isScript).toBe(true);

    expect(blocks[1]!.kind).toBe("script");
    expect(blocks[1]!.tag).toBe('<script setup lang="ts">');
    expect(blocks[1]!.name).toBe("script:setup");
    expect(blocks[1]!.isScript).toBe(true);

    expect(blocks[2]!.kind).toBe("template");
    expect(blocks[2]!.tag).toBe("<template>");

    expect(blocks[3]!.kind).toBe("style");
    expect(blocks[3]!.tag).toBe("<style scoped>");

    expect(blocks[4]!.kind).toBe("style");
    expect(blocks[4]!.tag).toBe("<style module>");
  });

  it("correctly extracts blocks from Svelte runes SFC", () => {
    const svelteFile = path.join(FIXTURES_DIR, "svelte-runes.svelte");
    const content = fs.readFileSync(svelteFile, "utf-8");
    const blocks = extractSvelteBlocks(content);

    const scriptBlocks = blocks.filter((b) => b.kind === "script");
    expect(scriptBlocks.length).toBe(2);
    expect(scriptBlocks[0]!.tag).toBe('<script context="module" lang="ts">');
    expect(scriptBlocks[0]!.name).toBe("script:module");
    expect(scriptBlocks[1]!.tag).toBe('<script lang="ts">');
    expect(scriptBlocks[1]!.name).toBe("script");

    const styleBlocks = blocks.filter((b) => b.kind === "style");
    expect(styleBlocks.length).toBe(1);
    expect(styleBlocks[0]!.tag).toBe("<style>");

    const markupBlocks = blocks.filter((b) => b.kind === "template");
    expect(markupBlocks.length).toBe(1);
    expect(markupBlocks[0]!.name).toBe("markup");
    expect(markupBlocks[0]!.tag).toBe("markup");
    expect(markupBlocks[0]!.hideInGlance).toBe(false);
  });

  it("correctly extracts blocks from Astro page SFC", () => {
    const astroFile = path.join(FIXTURES_DIR, "astro-page.astro");
    const content = fs.readFileSync(astroFile, "utf-8");
    const blocks = extractAstroBlocks(content);

    const fmBlocks = blocks.filter((b) => b.kind === "frontmatter");
    expect(fmBlocks.length).toBe(1);
    expect(fmBlocks[0]!.tag).toBe("---");
    expect(fmBlocks[0]!.startLine).toBe(1);
    expect(fmBlocks[0]!.endLine).toBe(13);

    const scriptBlocks = blocks.filter((b) => b.kind === "script");
    expect(scriptBlocks.length).toBe(1);
    expect(scriptBlocks[0]!.tag).toBe("<script>");

    const styleBlocks = blocks.filter((b) => b.kind === "style");
    expect(styleBlocks.length).toBe(1);
    expect(styleBlocks[0]!.tag).toBe("<style is:global>");

    const markupBlocks = blocks.filter((b) => b.kind === "template");
    expect(markupBlocks.length).toBe(1);
    expect(markupBlocks[0]!.name).toBe("markup");
    expect(markupBlocks[0]!.tag).toBe("markup");
    expect(markupBlocks[0]!.hideInGlance).toBe(false);
  });

  it("correctly extracts discrete segments from interleaved Astro SFC", () => {
    const interleavedFile = path.join(FIXTURES_DIR, "astro-interleaved.astro");
    const content = fs.readFileSync(interleavedFile, "utf-8");
    const blocks = extractAstroBlocks(content);

    expect(blocks.length).toBe(5);
    expect(blocks[0]!.name).toBe("frontmatter");
    expect(blocks[0]!.startLine).toBe(1);
    expect(blocks[0]!.endLine).toBe(7);

    expect(blocks[1]!.name).toBe("markup:1");
    expect(blocks[1]!.startLine).toBe(9);
    expect(blocks[1]!.endLine).toBe(12);

    expect(blocks[2]!.name).toBe("script");
    expect(blocks[2]!.tag).toBe("<script is:inline>");
    expect(blocks[2]!.startLine).toBe(14);
    expect(blocks[2]!.endLine).toBe(16);

    expect(blocks[3]!.name).toBe("markup:2");
    expect(blocks[3]!.startLine).toBe(18);
    expect(blocks[3]!.endLine).toBe(22);

    expect(blocks[4]!.name).toBe("style");
    expect(blocks[4]!.startLine).toBe(24);
    expect(blocks[4]!.endLine).toBe(26);
  });
});

describe("SFC: Masking Fidelity", () => {
  it("preserves exact character length, line count, and offsets in masked text", () => {
    const vueFile = path.join(FIXTURES_DIR, "vue-dual-script.vue");
    const content = fs.readFileSync(vueFile, "utf-8");
    const blocks = extractVueBlocks(content);
    const masked = maskSfc(content, blocks);

    expect(masked.length).toBe(content.length);
    expect(masked.split("\n").length).toBe(content.split("\n").length);

    // Delimiters replaced by spaces
    expect(masked.startsWith("                  ")).toBe(true); // <script lang="ts"> replaced with spaces
    // Inner script content preserved verbatim
    expect(masked).toContain("export const DEFAULT_ROLE = 'guest';");
    expect(masked).toContain("class FormValidator");
    // Non-script regions masked to whitespace
    expect(masked).not.toContain("<template>");
    expect(masked).not.toContain("<style scoped>");
  });
});

describe("SFC: CLI Glance Outlines & Hierarchy", () => {
  it("outlines Vue SFC with verbatim root blocks and 2-space depth indentation", () => {
    const vueFile = path.join(FIXTURES_DIR, "vue-dual-script.vue");
    const res = runCli(["glance", vueFile, "-s"]);
    expect(res.status).toBe(0);

    // Verbatim root blocks (Depth 0)
    expect(res.stdout).toContain('  L1-L4        <script lang="ts">');
    expect(res.stdout).toContain('  L6-L23       <script setup lang="ts">');
    expect(res.stdout).toContain("  L25-L30      <template>");
    expect(res.stdout).toContain("  L32-L36      <style scoped>");
    expect(res.stdout).toContain("  L38-L42      <style module>");

    // Declarations inside script (Depth 1: 2 spaces indent)
    expect(res.stdout).toContain("  L2-L2          export const DEFAULT_ROLE = 'guest'");
    expect(res.stdout).toContain("  L7-L9          interface Props");
    expect(res.stdout).toContain("  L11-L16        class FormValidator");
    expect(res.stdout).toContain("  L20-L22        function submitForm(): void");

    // Class members inside FormValidator (Depth 2: 4 spaces indent)
    expect(res.stdout).toContain("  L12-L12          method constructor(public config: Props)");
    expect(res.stdout).toContain("  L13-L15          method validate(): boolean");
  });

  it("outlines Svelte runes with natural markup outline and without artificial template entries", () => {
    const svelteFile = path.join(FIXTURES_DIR, "svelte-runes.svelte");
    const res = runCli(["glance", svelteFile, "-s"]);
    expect(res.status).toBe(0);

    expect(res.stdout).toContain('<script context="module" lang="ts">');
    expect(res.stdout).toContain('<script lang="ts">');
    expect(res.stdout).toContain("markup");
    expect(res.stdout).toContain("<style>");
    // Should NOT contain artificial <template> in glance
    expect(res.stdout).not.toContain("<template>");

    // Declarations
    expect(res.stdout).toContain("export const MODULE_VERSION = '1.0.0'");
    expect(res.stdout).toContain("export function getVersion(): string");
    expect(res.stdout).toContain("let count = $state(initialCount)");
  });

  it("outlines Astro page frontmatter as '---', markup, and client script", () => {
    const astroFile = path.join(FIXTURES_DIR, "astro-page.astro");
    const res = runCli(["glance", astroFile, "-s"]);
    expect(res.status).toBe(0);

    expect(res.stdout).toContain("  L1-L13       ---");
    expect(res.stdout).toContain("  L2-L4          interface PageProps");
    expect(res.stdout).toContain("  L10-L12        function formatTitle(t: string): string");
    expect(res.stdout).toContain("  L15-L18      markup");
    expect(res.stdout).toContain("  L20-L22      <script>");
    expect(res.stdout).toContain("  L24-L29      <style is:global>");
  });

  it("outlines interleaved Astro SFC with discrete markup segments flanking inlined script", () => {
    const interleavedFile = path.join(FIXTURES_DIR, "astro-interleaved.astro");
    const res = runCli(["glance", interleavedFile, "-s"]);
    expect(res.status).toBe(0);

    expect(res.stdout).toContain("  L1-L7        ---");
    expect(res.stdout).toContain("  L2-L4          interface PageProps");
    expect(res.stdout).toContain("  L9-L12       markup:1");
    expect(res.stdout).toContain("  L14-L16      <script is:inline>");
    expect(res.stdout).toContain("  L18-L22      markup:2");
    expect(res.stdout).toContain("  L24-L26      <style>");
  });

  it("filters SFC components using -f", () => {
    const vueFile = path.join(FIXTURES_DIR, "vue-dual-script.vue");
    const res = runCli(["glance", vueFile, "-s", "-f", "FormValidator"]);
    expect(res.status).toBe(0);

    expect(res.stdout).toContain("class FormValidator");
    expect(res.stdout).not.toContain("DEFAULT_ROLE");
    expect(res.stdout).not.toContain("<template>");
  });

  it("shows details with -d on SFC interfaces and classes", () => {
    const vueFile = path.join(FIXTURES_DIR, "vue-dual-script.vue");
    const res = runCli(["glance", vueFile, "-d"]);
    expect(res.status).toBe(0);

    expect(res.stdout).toContain("| id: string");
  });
});

describe("SFC: Block Target Resolution & Disambiguation", () => {
  const vueFile = path.join(FIXTURES_DIR, "vue-dual-script.vue");
  const svelteFile = path.join(FIXTURES_DIR, "svelte-runes.svelte");
  const astroFile = path.join(FIXTURES_DIR, "astro-page.astro");

  it("extracts symbol from script directly", () => {
    const res = runCli(["block", vueFile, "submitForm"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("function submitForm(): void {");
    expect(res.stdout).toContain("console.log('Submitting');");
  });

  it("extracts method with Class.method syntax", () => {
    const res = runCli(["block", vueFile, "FormValidator.validate"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("validate(): boolean {");
    expect(res.stdout).toContain("return true;");
  });

  it("extracts template in Vue SFC", () => {
    const res = runCli(["block", vueFile, "template"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('<div class="user-profile">');
    expect(res.stdout).toContain("</template>");
  });

  it("extracts raw template with --raw", () => {
    const res = runCli(["block", vueFile, "template", "--raw"]);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("===");
    expect(res.stdout).not.toContain("|");
    expect(res.stdout).toContain("<template>");
  });

  it("extracts markup body in Svelte when targeting template, markup, or html aliases", () => {
    const resTemplate = runCli(["block", svelteFile, "template"]);
    expect(resTemplate.status).toBe(0);
    expect(resTemplate.stdout).toContain("<main>");
    expect(resTemplate.stdout).toContain("<h1>Counter: {count}</h1>");
    expect(resTemplate.stdout).toContain("</main>");

    const resMarkup = runCli(["block", svelteFile, "markup"]);
    expect(resMarkup.status).toBe(0);
    expect(resMarkup.stdout).toContain("<h1>Counter: {count}</h1>");

    const resHtml = runCli(["block", svelteFile, "html"]);
    expect(resHtml.status).toBe(0);
    expect(resHtml.stdout).toContain("<h1>Counter: {count}</h1>");
  });

  it("extracts Vue template using semantic aliases markup and html", () => {
    const resMarkup = runCli(["block", vueFile, "markup"]);
    expect(resMarkup.status).toBe(0);
    expect(resMarkup.stdout).toContain('<div class="user-profile">');

    const resHtml = runCli(["block", vueFile, "html"]);
    expect(resHtml.status).toBe(0);
    expect(resHtml.stdout).toContain('<div class="user-profile">');
  });

  it("extracts discrete markup segments from interleaved Astro using indexed targets", () => {
    const interleavedFile = path.join(FIXTURES_DIR, "astro-interleaved.astro");

    const resChunk1 = runCli(["block", interleavedFile, "markup:1"]);
    expect(resChunk1.status).toBe(0);
    expect(resChunk1.stdout).toContain("<head>");
    expect(resChunk1.stdout).toContain("<title>{title}</title>");
    expect(resChunk1.stdout).toContain("</head>");
    expect(resChunk1.stdout).not.toContain("Analytics initialized");

    const resChunk2 = runCli(["block", interleavedFile, "markup:2"]);
    expect(resChunk2.status).toBe(0);
    expect(resChunk2.stdout).toContain("<body>");
    expect(resChunk2.stdout).toContain("<h1>Welcome to {title}</h1>");
    expect(resChunk2.stdout).toContain("</body>");
    expect(resChunk2.stdout).not.toContain("Analytics initialized");

    // Aliased indexed access
    const resTemplate1 = runCli(["block", interleavedFile, "template:1"]);
    expect(resTemplate1.status).toBe(0);
    expect(resTemplate1.stdout).toContain("<head>");

    const resHtml2 = runCli(["block", interleavedFile, "html:2"]);
    expect(resHtml2.status).toBe(0);
    expect(resHtml2.stdout).toContain("<body>");
  });

  it("detects ambiguous markup when multiple segments exist and suggests markup:1 / markup:2", () => {
    const interleavedFile = path.join(FIXTURES_DIR, "astro-interleaved.astro");

    const resMarkup = runCli(["block", interleavedFile, "markup"]);
    expect(resMarkup.status).toBe(3);
    expect(resMarkup.stderr).toContain("Error: ambiguous target 'markup' matched 2 candidates");
    expect(resMarkup.stderr).toContain("markup:1");
    expect(resMarkup.stderr).toContain("markup:2");
    expect(resMarkup.stderr).toContain("Tip: Disambiguate with markup:1, markup:2");

    const resTemplate = runCli(["block", interleavedFile, "template"]);
    expect(resTemplate.status).toBe(3);
    expect(resTemplate.stderr).toContain("Error: ambiguous target 'template' matched 2 candidates");

    const resHtml = runCli(["block", interleavedFile, "html"]);
    expect(resHtml.status).toBe(3);
    expect(resHtml.stderr).toContain("Error: ambiguous target 'html' matched 2 candidates");
  });

  it("extracts inlined script cleanly in interleaved Astro", () => {
    const interleavedFile = path.join(FIXTURES_DIR, "astro-interleaved.astro");
    const res = runCli(["block", interleavedFile, "script"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("<script is:inline>");
    expect(res.stdout).toContain("Analytics initialized");
    expect(res.stdout).not.toContain("<head>");
    expect(res.stdout).not.toContain("<body>");
  });

  it("extracts Astro frontmatter with 'frontmatter' and '---'", () => {
    const res1 = runCli(["block", astroFile, "frontmatter"]);
    expect(res1.status).toBe(0);
    expect(res1.stdout).toContain("interface PageProps");

    const res2 = runCli(["block", astroFile, "---"]);
    expect(res2.status).toBe(0);
    expect(res2.stdout).toContain("interface PageProps");
  });

  it("detects ambiguous script target when multiple script blocks exist", () => {
    const res = runCli(["block", vueFile, "script"]);
    expect(res.status).toBe(3);
    expect(res.stderr).toContain("Error: ambiguous target 'script' matched 2 candidates");
    expect(res.stderr).toContain('<script lang="ts">');
    expect(res.stderr).toContain('<script setup lang="ts">');
    expect(res.stderr).toContain("Tip: Disambiguate");
  });

  it("detects ambiguous style target when multiple style blocks exist", () => {
    const res = runCli(["block", vueFile, "style"]);
    expect(res.status).toBe(3);
    expect(res.stderr).toContain("Error: ambiguous target 'style' matched 2 candidates");
    expect(res.stderr).toContain("<style scoped>");
    expect(res.stderr).toContain("<style module>");
  });

  it("extracts specific script block when qualified", () => {
    const res = runCli(["block", vueFile, "script:setup"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('<script setup lang="ts">');
    expect(res.stdout).toContain("class FormValidator");
  });

  it("extracts specific style block when qualified", () => {
    const res = runCli(["block", vueFile, "style scoped"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("<style scoped>");
    expect(res.stdout).toContain(".user-profile {");
  });

  it("extracts unambiguous style block in Svelte", () => {
    const res = runCli(["block", svelteFile, "style"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("<style>");
    expect(res.stdout).toContain("text-align: center;");
  });
});

describe("SFC: Test File Filtering", () => {
  it("excludes *.test.vue by default in glance", () => {
    const dir = FIXTURES_DIR;
    const res = runCli(["glance", dir]);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("component.test.vue");
  });

  it("includes *.test.vue when -t is passed", () => {
    const dir = FIXTURES_DIR;
    const res = runCli(["glance", dir, "-t"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("component.test.vue");
    expect(res.stdout).toContain("[test]");
  });
});
