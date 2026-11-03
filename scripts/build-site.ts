import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const codingTranscriptDir = join(rootDir, "coding-transcript");
const siteDir = join(rootDir, "site");
const transcriptDistIndex = join(codingTranscriptDir, "dist", "index.html");
const sitePublicTranscript = join(siteDir, "public", "coding-transcript.html");

console.log("==> 1. Building coding-transcript...");
await $`bun run --cwd ${codingTranscriptDir} build`;

if (!existsSync(transcriptDistIndex)) {
  console.error(`Error: Expected ${transcriptDistIndex} to exist after build.`);
  process.exit(1);
}

// Ensure the target in site/public is available (handles symlink or direct copy fallback)
console.log("==> 2. Verifying site/public/coding-transcript.html...");
if (!existsSync(sitePublicTranscript)) {
  console.log('coding-transcript.html is not found. Manually copying over.')
  await $`cp ${transcriptDistIndex} ${sitePublicTranscript}`;
}

console.log("==> 3. Building Astro site...");
await $`bun run --cwd ${siteDir} build`;

console.log("==> Site build complete! Output in site/dist");
