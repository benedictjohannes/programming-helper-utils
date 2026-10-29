use crate::fs::collect_rust_files;
use crate::model::Item;
use crate::parser::parse_rust_file;

pub struct GlanceOptions {
    pub paths: Vec<String>,
    pub signatures: bool,
    pub details: bool,
    pub imports: bool,
    pub filters: Vec<String>,
    pub include_tests: bool,
}

pub fn run_glance(opts: GlanceOptions) -> i32 {
    let files = match collect_rust_files(&opts.paths, opts.include_tests) {
        Ok(f) => f,
        Err(err) => {
            eprintln!("Error reading paths: {}", err);
            return 1;
        }
    };

    if files.is_empty() {
        eprintln!("Error: no .rs files found matching input.");
        return 1;
    }

    let mut printed_files = 0;

    for file_path in &files {
        let content = match std::fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(err) => {
                eprintln!("Warning: failed to read {}: {}", file_path.display(), err);
                continue;
            }
        };

        let path_str = file_path.to_string_lossy();
        let parsed = parse_rust_file(&path_str, &content);

        // Filter items
        let visible_items: Vec<&Item> = parsed
            .items
            .iter()
            .filter(|item| {
                if !opts.include_tests && item.is_test {
                    return false;
                }
                match_filters(item, &opts.filters)
            })
            .collect();

        // If filtering is active and no items matched and no syntax errors, skip file
        if !opts.filters.is_empty() && visible_items.is_empty() && parsed.syntax_errors.is_empty() {
            continue;
        }

        if printed_files > 0 {
            println!();
        }
        printed_files += 1;

        // Print header
        let error_tag = if !parsed.syntax_errors.is_empty() {
            let n = parsed.syntax_errors.len();
            if n == 1 {
                " [! 1 syntax error]".to_string()
            } else {
                format!(" [! {} syntax errors]", n)
            }
        } else {
            String::new()
        };

        println!("=== {} ({} lines){} ===", parsed.path, parsed.total_lines, error_tag);

        // Print syntax error notices directly under the header
        for err in &parsed.syntax_errors {
            println!("  Syntax Notice: L{}: {}", err.line, err.message);
        }

        // Print imports if requested (-u)
        if opts.imports {
            println!();
            if parsed.uses.is_empty() {
                println!("Imports: (none)");
            } else {
                println!("Imports:");
                for u in &parsed.uses {
                    println!("  {}", u);
                }
            }
        }

        // Print outline
        println!();
        println!("Outline:");
        for item in &visible_items {
            let header_str = if opts.signatures {
                &item.signature
            } else {
                &item.name
            };

            let span = format!("L{}-L{}", item.start_line, item.end_line);
            if opts.signatures {
                println!("  {:<12} {}", span, header_str);
            } else {
                println!("  {:<12} {} {}", span, item.kind.as_str(), header_str);
            }

            // Print details (-d)
            if opts.details && !item.details.is_empty() {
                for detail in &item.details {
                    println!("      | {}", detail.signature);
                }
            }
        }
    }

    0
}

fn match_filters(item: &Item, filters: &[String]) -> bool {
    if filters.is_empty() {
        return true;
    }

    let search_corpus = format!(
        "{} {} {} {}",
        item.name,
        item.qualified_name,
        item.kind.as_str(),
        item.signature
    ).to_lowercase();

    for f in filters {
        if !search_corpus.contains(&f.to_lowercase()) {
            return false;
        }
    }
    true
}
