import { describe, it, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Single-File Standalone Build Verification', () => {
  const projectDir = join(import.meta.dir, '..');
  const distIndexPath = join(projectDir, 'dist', 'index.html');

  it('executes bun run build without errors', async () => {
    const proc = Bun.spawn(['bun', 'run', 'build'], {
      cwd: projectDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    if (exitCode !== 0) {
      console.error('Build failed with stderr:', stderr);
    }
  });

  it('generates dist/index.html as a non-empty standalone file', () => {
    expect(existsSync(distIndexPath)).toBe(true);

    const content = readFileSync(distIndexPath, 'utf-8');
    expect(content.length).toBeGreaterThan(50_000); // Expect inlined singlefile bundle (> 50KB)
    expect(content).toMatch(/<!doctype html>/i);
  });

  it('inlines all scripts and styles with no external network script or stylesheet dependencies', () => {
    const content = readFileSync(distIndexPath, 'utf-8');

    // Scripts should be inlined, not referencing external URLs
    expect(content).not.toMatch(/<script[^>]+src=["']https?:\/\//i);

    // Stylesheets should be inlined, not referencing external CSS URLs
    expect(content).not.toMatch(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:\/\//i);

    // Should contain inlined script and style
    expect(content).toContain('<script');
    expect(content).toContain('<style');
  });
});
