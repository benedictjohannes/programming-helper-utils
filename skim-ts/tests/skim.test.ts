import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import * as path from "node:path";

const CLI_PATH = path.resolve(__dirname, "../skim-ts");
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

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

describe("CLI Basics", () => {
  it("prints USAGE_DOC when invoked with no arguments", () => {
    const res = runCli([]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("skim-ts: Fast TypeScript outline & block extractor");
    expect(res.stdout).toContain("Usage:");
  });

  it("prints USAGE_DOC on --help", () => {
    const res = runCli(["--help"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("skim-ts: Fast TypeScript outline & block extractor");
  });

  it("fails with error when glance has no paths", () => {
    const res = runCli(["glance"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Error: glance requires at least one <path> target.");
  });

  it("fails with error when block has insufficient arguments", () => {
    const res = runCli(["block", "someFile.ts"]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Error: block requires <file> and <target> arguments.");
  });

  it("handles wildcard glob patterns in glance", () => {
    const globPattern = path.join(FIXTURES_DIR, "*.ts");
    const res = runCli(["glance", globPattern]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("fixtures/classes.ts");
    expect(res.stdout).toContain("fixtures/casing.ts");
  });
});

describe("Classes & Methods (fixtures/classes.ts)", () => {
  const file = path.join(FIXTURES_DIR, "classes.ts");

  it("outlines class members without -s", () => {
    const res = runCli(["glance", file]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("class UserService");
    expect(res.stdout).toContain("method constructor");
    expect(res.stdout).toContain("method getCount");
    expect(res.stdout).toContain("method getUser");
    expect(res.stdout).toContain("method database");
  });

  it("outlines signatures with -s", () => {
    const res = runCli(["glance", file, "-s"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("export class UserService");
    expect(res.stdout).toContain("method constructor(db: string)");
    expect(res.stdout).toContain("method static getCount(): number");
    expect(res.stdout).toContain("method public async getUser(id: string): Promise<{ id: string; name: string }>");
    expect(res.stdout).toContain("method public get database(): string");
    expect(res.stdout).toContain("method public set database(val: string)");
    expect(res.stdout).toContain("method public boundAction = (action: string): void");
  });

  it("shows fields when -d is passed", () => {
    const res = runCli(["glance", file, "-d"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("| private db: string;");
    expect(res.stdout).toContain("| static instanceCount = 0;");
  });

  it("extracts method block with line numbers", () => {
    const res = runCli(["block", file, "UserService.getUser"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("=== fixtures/classes.ts (L14-L16) ===");
    expect(res.stdout).toContain("14 |   public async getUser(id: string): Promise<{ id: string; name: string }> {");
    expect(res.stdout).toContain('15 |     return { id, name: "Alice" };');
    expect(res.stdout).toContain("16 |   }");
  });

  it("extracts method block raw without gutter or header", () => {
    const res = runCli(["block", file, "UserService.getUser", "--raw"]);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("===");
    expect(res.stdout).not.toContain(" | ");
    expect(res.stdout).toContain('public async getUser(id: string): Promise<{ id: string; name: string }> {');
  });

  it("extracts constructor block", () => {
    const res = runCli(["block", file, "UserService.constructor"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("constructor(db: string) {");
  });

  it("extracts bound arrow function method", () => {
    const res = runCli(["block", file, "UserService.boundAction"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("public boundAction = (action: string): void => {");
  });
});

describe("Casing Precedence (fixtures/casing.ts)", () => {
  const file = path.join(FIXTURES_DIR, "casing.ts");

  it("matches exact case Config for type", () => {
    const res = runCli(["block", file, "Config"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("export type Config = {");
  });

  it("matches exact case config for const", () => {
    const res = runCli(["block", file, "config"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("export const config: Config = {");
  });

  it("matches case-insensitively for unique identifier setupServer", () => {
    const res = runCli(["block", file, "setupserver"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("export function setupServer(cfg: Config): void {");
  });
});

describe("Test Handling & Filtering (fixtures/tests.ts)", () => {
  const file = path.join(FIXTURES_DIR, "tests.ts");

  it("filters out describe/test blocks by default and reports test ranges", () => {
    const res = runCli(["glance", file]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("[tests skipped: 5..13, 15..17]");
    expect(res.stdout).toContain("function calculateTotal");
    expect(res.stdout).toContain("function helper");
    expect(res.stdout).not.toContain("calculateTotal suite");
    expect(res.stdout).not.toContain("standalone sanity check");
  });

  it("includes test blocks when -t is passed", () => {
    const res = runCli(["glance", file, "-t"]);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("[tests skipped");
    expect(res.stdout).toContain('test describe("calculateTotal suite")');
    expect(res.stdout).toContain('test test("standalone sanity check")');
  });

  it("fails to find test block when -t is not passed", () => {
    const res = runCli(["block", file, "calculateTotal suite"]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("Error: block 'calculateTotal suite' not found");
  });

  it("finds and extracts test block when -t is passed", () => {
    const res = runCli(["block", file, "calculateTotal suite", "-t"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('describe("calculateTotal suite", () => {');
  });
});

describe("Enums & Details (fixtures/enums.ts)", () => {
  const file = path.join(FIXTURES_DIR, "enums.ts");

  it("shows enum variants with -d", () => {
    const res = runCli(["glance", file, "-d"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("enum Direction");
    expect(res.stdout).toContain("| Up");
    expect(res.stdout).toContain("| Down");
    expect(res.stdout).toContain("enum Status");
    expect(res.stdout).toContain('| Active = "ACTIVE"');
  });

  it("extracts enum variant block with Status.Active", () => {
    const res = runCli(["block", file, "Status.Active"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Active = "ACTIVE"');
  });
});

describe("Ambiguity Handling", () => {
  it("detects ambiguous target and displays tip with exit code 3", () => {
    const file = path.join(FIXTURES_DIR, "ambiguous.ts");
    const res = runCli(["block", file, "parse"]);
    expect(res.status).toBe(3);
    expect(res.stderr).toContain("Error: ambiguous target 'parse' matched 2 candidates");
    expect(res.stderr).toContain("Tip: Disambiguate with Class.method (e.g. UserService.getUser) or read line range directly.");
  });
});

describe("Syntax Error Resilience (fixtures/broken.ts)", () => {
  const file = path.join(FIXTURES_DIR, "broken.ts");

  it("glance displays syntax error count in header and syntax notice line", () => {
    const res = runCli(["glance", file, "-s"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("[! 1 syntax error]");
    expect(res.stdout).toContain("Syntax Notice: L7: Expression expected.");
    expect(res.stdout).toContain("export interface WorkingConfig");
    expect(res.stdout).toContain("export function brokenFunction()");
    expect(res.stdout).toContain("export interface AnotherValidInterface");
  });

  it("block displays syntax notice and error tag when symbol contains syntax error", () => {
    const res = runCli(["block", file, "brokenFunction"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("[! 1 syntax error]");
    expect(res.stdout).toContain("Syntax Notice: L7: Expression expected.");
    expect(res.stdout).toContain("const x =");
    expect(res.stdout).toContain("const y = 20;");
  });

  it("block does not display syntax notice for valid symbol in same broken file", () => {
    const res = runCli(["block", file, "WorkingConfig"]);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("[!");
    expect(res.stdout).not.toContain("Syntax Notice");
    expect(res.stdout).toContain("export interface WorkingConfig {");
  });
});

describe("Comments & Line Spans (fixtures/comments.ts)", () => {
  const file = path.join(FIXTURES_DIR, "comments.ts");
  const MARKERS = [
    "JSDOC_", "TP_COMMENT", "TRAILING_MEMBER", "LINE_MEMBER_COMMENT", "INLINE_TYPE_COMMENT",
    "PARAM_IN_SIG", "DECORATOR_TRAILING", "FIELD_TRAILING", "COMMENT_IN_PARAMS", "AFTER_ID",
    "LAST_PARAM", "BEFORE_RETURN", "BEFORE_BRACE", "BODY_COMMENT", "ARROW_PARAM", "ENUM_TRAILING",
    "ENUM_LINE", "ENUM_INLINE", "INLINE_PARAM", "AFTER_BRACE", "ARROW_INLINE", "DETACHED_", "plain comment",
  ];

  for (const flags of [[], ["-s"], ["-s", "-d"], ["-d"]]) {
    it(`glance ${flags.join(" ") || "(default)"} output contains no comment text`, () => {
      const res = runCli(["glance", file, ...flags]);
      expect(res.status).toBe(0);
      for (const m of MARKERS) expect(res.stdout).not.toContain(m);
      expect(res.stdout).not.toContain("/*");
      expect(res.stdout).not.toContain("//");
      expect(res.stdout).not.toContain("@Log");
    });
  }

  it("rebuilds signatures from code tokens (no swallowed code, tidy spacing)", () => {
    const res = runCli(["glance", file, "-s", "-d"]);
    expect(res.stdout).toContain("export interface Config<T>");
    expect(res.stdout).toContain("| name?: string;");
    expect(res.stdout).toContain("| run(x: number): void;");
    expect(res.stdout).toContain("method public async fetch(id: string, other: number): Promise<string>");
    expect(res.stdout).toContain("| Green = 2");
    expect(res.stdout).toContain("export function add(a: number, b: number): number");
    expect(res.stdout).toContain("export const twice = (x: number): number");
    expect(res.stdout).not.toContain("=>");
  });

  it("spans start at the attached JSDoc/decorators, not at detached comments", () => {
    const res = runCli(["glance", file, "-s"]);
    expect(res.stdout).toMatch(/L3-L12\s+export interface Config/);
    expect(res.stdout).toMatch(/L16-L37\s+export class Service/);
    expect(res.stdout).toMatch(/L23-L32\s+method public async fetch/);
    expect(res.stdout).toMatch(/L55-L56\s+export const twice/);
    expect(res.stdout).toMatch(/L60-L62\s+export function plain/);
  });

  it("block output begins with the JSDoc and excludes detached comments", () => {
    const res = runCli(["block", file, "Config"]);
    expect(res.stdout).toContain("=== fixtures/comments.ts (L3-L12) ===");
    expect(res.stdout).toContain("3 | /**");
    expect(res.stdout).not.toContain("DETACHED_FILE_HEADER");
    const m = runCli(["block", file, "Service.fetch", "--raw"]);
    expect(m.stdout.startsWith("  /** JSDOC_METHOD fetches */\n  @Log()\n")).toBe(true);
    expect(m.stdout).not.toContain("plain comment");
    const p = runCli(["block", file, "plain", "--raw"]);
    expect(p.stdout.startsWith("export function plain")).toBe(true);
  });
});
