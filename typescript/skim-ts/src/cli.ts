import { runGlance } from './glance';
import { runBlock } from './block';
import type { GlanceOptions, BlockOptions } from './types';

const USAGE_DOC = `\
skim-ts: Fast TypeScript outline & block extractor without test bloat.
Prefer this over reading entire .ts/.js files to preserve token context.

Usage:
  skim-ts glance [options] <path>...
  skim-ts block  [options] <file> <target>

glance:
  Outline structure, signatures, and line ranges across files/directories.

  Usage:
    skim-ts glance [options] <path>...

  Arguments:
    <path>...                 One or more source files, directories, or globs

  Options:
    -s, --signatures          Show declarations & types without function bodies
    -d, --details             Show interface/type properties, enum members, and class fields
    -u, --uses, --imports     Display top-level import statements
    -f, --filter <text>       Filter items containing <text> (case-insensitive, repeatable)
    -t, --include-tests       Include test files (*.test.ts, *.spec.ts, etc.) and test blocks

  Examples:
    skim-ts glance src/types.ts
    skim-ts glance src/ -s -u
    skim-ts glance src/ -s -f "ZodType"

block:
  Extract verbatim code block for a class, method, interface, type, or function.

  Usage:
    skim-ts block [options] <file> <target>

  Arguments:
    <file>                    Path to the source file
    <target>                  Name of class, interface, type, fn, or Class.method

  Options:
    -t, --include-tests       Search inside test files and test blocks
    --raw                     Omit line number gutter

  Examples:
    skim-ts block src/types.ts ZodType
    skim-ts block src/types.ts ZodType.parse
    skim-ts block src/types.ts ZodType.parse --raw

  Disambiguation:
    If multiple items match, qualify Class.method (e.g. UserService.getUser) or read line range directly.

Agent Operational Workflow:
  1. Glance first:   skim-ts glance <path> -s
  2. Locate logic:   skim-ts glance <path> -f <keyword>
  3. Inspect code:   Use \`block <file> <Class.method>\`, or read reported line spans (Lxx-Lyy)
`;

function parseArgs(args: string[]) {
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(USAGE_DOC.trim());
    process.exit(0);
  }

  const subcommand = args[0];
  const rest = args.slice(1);

  if (subcommand === 'glance') {
    const targets: string[] = [];
    const filter: string[] = [];
    let signatures = false;
    let details = false;
    let uses = false;
    let includeTests = false;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '-s' || arg === '--signatures') {
        signatures = true;
      } else if (arg === '-d' || arg === '--details') {
        details = true;
      } else if (arg === '-u' || arg === '--uses' || arg === '--imports') {
        uses = true;
      } else if (arg === '-t' || arg === '--include-tests') {
        includeTests = true;
      } else if (arg === '-f' || arg === '--filter') {
        if (i + 1 < rest.length) {
          filter.push(rest[++i]);
        }
      } else if (arg.startsWith('--filter=')) {
        filter.push(arg.slice('--filter='.length));
      } else if (arg.startsWith('-f') && arg.length > 2) {
        filter.push(arg.slice(2));
      } else if (arg.startsWith('-') && !arg.startsWith('--')) {
        // Clustered short flags e.g. -su, -sd
        for (let j = 1; j < arg.length; j++) {
          const ch = arg[j];
          if (ch === 's') signatures = true;
          else if (ch === 'd') details = true;
          else if (ch === 'u') uses = true;
          else if (ch === 't') includeTests = true;
        }
      } else {
        targets.push(arg);
      }
    }

    if (targets.length === 0) {
      process.stderr.write('Error: glance requires at least one <path> target.\n');
      process.exit(1);
    }

    const options: GlanceOptions = {
      targets,
      signatures,
      details,
      uses,
      filter: filter.length > 0 ? filter : undefined,
      includeTests,
    };

    runGlance(options);
  } else if (subcommand === 'block') {
    const positionals: string[] = [];
    let includeTests = false;
    let raw = false;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '-t' || arg === '--include-tests') {
        includeTests = true;
      } else if (arg === '--raw') {
        raw = true;
      } else if (arg.startsWith('-') && !arg.startsWith('--')) {
        for (let j = 1; j < arg.length; j++) {
          const ch = arg[j];
          if (ch === 't') includeTests = true;
        }
      } else {
        positionals.push(arg);
      }
    }

    if (positionals.length < 2) {
      process.stderr.write('Error: block requires <file> and <target> arguments.\n');
      process.exit(1);
    }

    const options: BlockOptions = {
      file: positionals[0],
      target: positionals[1],
      includeTests,
      raw,
    };

    runBlock(options);
  } else {
    process.stderr.write(`Error: unknown subcommand '${subcommand}'.\n\n${USAGE_DOC.trim()}\n`);
    process.exit(1);
  }
}

parseArgs(process.argv.slice(2));
