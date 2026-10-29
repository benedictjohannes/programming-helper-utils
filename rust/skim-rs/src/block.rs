use std::path::Path;

use crate::model::Item;
use crate::parser::parse_rust_file;

pub struct BlockOptions {
    pub file: String,
    pub target: String,
    pub raw: bool,
    pub include_tests: bool,
}

pub fn run_block(opts: BlockOptions) -> i32 {
    let path = Path::new(&opts.file);
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(err) => {
            eprintln!("Error reading {}: {}", path.display(), err);
            return 1;
        }
    };

    let path_str = path.to_string_lossy();
    let parsed = parse_rust_file(&path_str, &content);

    // Candidates
    let candidates: Vec<&Item> = parsed
        .items
        .iter()
        .filter(|item| {
            if !opts.include_tests && item.is_test {
                return false;
            }
            true
        })
        .collect();

    let matches = find_matches(&candidates, &opts.target);

    if matches.is_empty() {
        eprintln!("Error: block '{}' not found in {}", opts.target, opts.file);
        return 2;
    }

    if matches.len() > 1 {
        eprintln!(
            "Ambiguous target '{}' matched {} candidates in {}:",
            opts.target,
            matches.len(),
            opts.file
        );
        for (i, m) in matches.iter().enumerate() {
            eprintln!(
                "  {}) L{}-L{}   {} {}",
                i + 1,
                m.start_line,
                m.end_line,
                m.kind.as_str(),
                m.qualified_name
            );
        }
        eprintln!();
        eprintln!("Tip: Disambiguate with Type::method (e.g. Router::route) or read line range directly.");
        return 3;
    }

    let target_item = matches[0];
    let start_idx = target_item.start_line.saturating_sub(1);
    let end_idx = target_item.end_line.min(parsed.lines.len());

    // Check for syntax errors within block range
    let block_errors: Vec<_> = parsed
        .syntax_errors
        .iter()
        .filter(|e| e.line >= target_item.start_line && e.line <= target_item.end_line)
        .collect();

    let error_tag = if !block_errors.is_empty() {
        let n = block_errors.len();
        if n == 1 {
            " [! 1 syntax error]".to_string()
        } else {
            format!(" [! {} syntax errors]", n)
        }
    } else {
        String::new()
    };

    if !opts.raw {
        println!(
            "=== {} (L{}-L{}){} ===",
            opts.file, target_item.start_line, target_item.end_line, error_tag
        );
        for err in &block_errors {
            println!("  Syntax Notice: L{}: {}", err.line, err.message);
        }
        for (i, line) in parsed.lines[start_idx..end_idx].iter().enumerate() {
            let line_num = target_item.start_line + i;
            println!("{:5} | {}", line_num, line);
        }
    } else {
        for line in &parsed.lines[start_idx..end_idx] {
            println!("{}", line);
        }
    }

    0
}

fn find_matches<'a>(items: &[&'a Item], target: &str) -> Vec<&'a Item> {
    let is_qualified = target.contains("::");

    if is_qualified {
        // 1. Exact match on qualified_name
        let exact: Vec<&Item> = items
            .iter()
            .copied()
            .filter(|it| it.qualified_name == target)
            .collect();
        if !exact.is_empty() {
            return exact;
        }

        // 2. Case-insensitive match on qualified_name
        let target_lower = target.to_lowercase();
        let ci: Vec<&Item> = items
            .iter()
            .copied()
            .filter(|it| it.qualified_name.to_lowercase() == target_lower)
            .collect();
        if !ci.is_empty() {
            return ci;
        }
    } else {
        // Standalone target: match either name or qualified_name

        // 1. Exact match on name
        let exact_name: Vec<&Item> = items
            .iter()
            .copied()
            .filter(|it| it.name == target)
            .collect();
        if !exact_name.is_empty() {
            return exact_name;
        }

        // 2. Exact match on qualified_name
        let exact_qual: Vec<&Item> = items
            .iter()
            .copied()
            .filter(|it| it.qualified_name == target)
            .collect();
        if !exact_qual.is_empty() {
            return exact_qual;
        }

        // 3. Case-insensitive match on name
        let target_lower = target.to_lowercase();
        let ci_name: Vec<&Item> = items
            .iter()
            .copied()
            .filter(|it| it.name.to_lowercase() == target_lower)
            .collect();
        if !ci_name.is_empty() {
            return ci_name;
        }

        // 4. Case-insensitive match on qualified_name
        let ci_qual: Vec<&Item> = items
            .iter()
            .copied()
            .filter(|it| it.qualified_name.to_lowercase() == target_lower)
            .collect();
        if !ci_qual.is_empty() {
            return ci_qual;
        }
    }

    // 5. Fallback substring matching
    let target_lower = target.to_lowercase();
    let substr: Vec<&Item> = items
        .iter()
        .copied()
        .filter(|it| {
            it.name.to_lowercase().contains(&target_lower)
                || it.qualified_name.to_lowercase().contains(&target_lower)
        })
        .collect();

    substr
}
