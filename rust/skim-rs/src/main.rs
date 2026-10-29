mod block;
mod fs;
mod glance;
mod model;
mod parser;

use std::env;
use std::process;

const USAGE_DOC: &str = r#"skim-rs: Fast Rust outline & block extractor without test bloat.
Prefer this over reading entire .rs files to preserve token context.

Usage:
  skim-rs glance [options] <path>...
  skim-rs block [options] <file> <target>

glance: Outline structure, signatures, and line ranges across files/directories.
  Usage: skim-rs glance [options] <path>...
  Arguments:
    <path>...              One or more .rs files, directories, or globs
  Options:
    -s, --signatures       Show declarations & types without function bodies
    -d, --details          Show struct fields, interface members, and enum variants
    -u, --uses, --imports  Display top-level imports and uses
    -f, --filter <text>    Filter items containing <text> (case-insensitive, repeatable)
    -t, --include-tests    Include test files, test modules, and test functions
  Examples:
    skim-rs glance axum/src/lib.rs
    skim-rs glance . -s -u
    skim-rs glance . -s -f "Router"

block: Extract verbatim code block for a type, function, or Type::method.
  Usage: skim-rs block [options] <file> <target>
  Arguments:
    <file>                 Path to the .rs file
    <target>               Name of type, fn, macro, or Type::method
  Options:
    -t, --include-tests    Search inside test functions/modules
    --raw                  Omit line number gutter
    -d, --details          Accepted for compatibility
  Examples:
    skim-rs block src/router.rs Router
    skim-rs block src/router.rs Router::route
    skim-rs block src/router.rs router::route
    skim-rs block src/handler.rs Handler --raw

Disambiguation:
  If multiple items match, qualify Type::method (e.g. Router::route) or read line range directly.

Agent Operational Workflow:
  1. Glance first:  skim-rs glance <path> -s
  2. Locate logic:  skim-rs glance <path> -f <keyword>
  3. Inspect code:  Use block <file> <Type::method>, or read reported line spans (Lxx-Lyy)
"#;

fn print_usage() {
    print!("{}", USAGE_DOC);
}

fn parse_glance_args(args: &[String]) -> Option<glance::GlanceOptions> {
    let mut paths = Vec::new();
    let mut signatures = false;
    let mut details = false;
    let mut imports = false;
    let mut filters = Vec::new();
    let mut include_tests = false;

    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        if arg == "-s" || arg == "--signatures" {
            signatures = true;
        } else if arg == "-d" || arg == "--details" {
            details = true;
        } else if arg == "-u" || arg == "--uses" || arg == "--imports" {
            imports = true;
        } else if arg == "-t" || arg == "--include-tests" {
            include_tests = true;
        } else if arg == "-f" || arg == "--filter" {
            if i + 1 < args.len() {
                filters.push(args[i + 1].clone());
                i += 1;
            } else {
                eprintln!("Error: -f / --filter requires an argument.");
                return None;
            }
        } else if arg.starts_with("-f=") || arg.starts_with("--filter=") {
            let val = arg.split_once('=').unwrap().1;
            filters.push(val.to_string());
        } else if arg.starts_with('-') {
            eprintln!("Error: unknown flag '{}'", arg);
            return None;
        } else {
            paths.push(arg.clone());
        }
        i += 1;
    }

    if paths.is_empty() {
        eprintln!("Error: glance requires at least one path.");
        return None;
    }

    Some(glance::GlanceOptions {
        paths,
        signatures,
        details,
        imports,
        filters,
        include_tests,
    })
}

fn parse_block_args(args: &[String]) -> Option<block::BlockOptions> {
    let mut file = None;
    let mut target = None;
    let mut raw = false;
    let mut include_tests = false;

    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        if arg == "--raw" {
            raw = true;
        } else if arg == "-t" || arg == "--include-tests" {
            include_tests = true;
        } else if arg == "-d" || arg == "--details" {
            // Accepted for compatibility
        } else if arg.starts_with('-') {
            eprintln!("Error: unknown flag '{}'", arg);
            return None;
        } else if file.is_none() {
            file = Some(arg.clone());
        } else if target.is_none() {
            target = Some(arg.clone());
        } else {
            eprintln!("Error: unexpected argument '{}'", arg);
            return None;
        }
        i += 1;
    }

    match (file, target) {
        (Some(f), Some(t)) => Some(block::BlockOptions {
            file: f,
            target: t,
            raw,
            include_tests,
        }),
        _ => {
            eprintln!("Error: block requires <file> and <target> arguments.");
            None
        }
    }
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        print_usage();
        process::exit(0);
    }

    let cmd = &args[0];
    if cmd == "-h" || cmd == "--help" || cmd == "help" {
        print_usage();
        process::exit(0);
    }

    let sub_args = &args[1..];
    let exit_code = match cmd.as_str() {
        "glance" => {
            if sub_args.iter().any(|a| a == "-h" || a == "--help") {
                print_usage();
                0
            } else if let Some(opts) = parse_glance_args(sub_args) {
                glance::run_glance(opts)
            } else {
                1
            }
        }
        "block" => {
            if sub_args.iter().any(|a| a == "-h" || a == "--help") {
                print_usage();
                0
            } else if let Some(opts) = parse_block_args(sub_args) {
                block::run_block(opts)
            } else {
                1
            }
        }
        unknown => {
            eprintln!("Error: unknown command '{}'", unknown);
            eprintln!("Run 'skim-rs --help' for usage.");
            1
        }
    };

    process::exit(exit_code);
}
