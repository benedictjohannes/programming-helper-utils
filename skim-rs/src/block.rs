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
        eprintln!("Error: target '{}' not found in {}", opts.target, opts.file);
        return 2;
    }

    if matches.len() > 1 {
        eprintln!(
            "Error: ambiguous target '{}' matched {} candidates in {}:",
            opts.target,
            matches.len(),
            opts.file
        );
        for (i, m) in matches.iter().enumerate() {
            let shown = impl_path(m).unwrap_or_else(|| m.qualified_name.clone());
            // Module path = qualified name minus `name` (and `Type` for impl members).
            let in_mod = if m.depth > 0 {
                let segs: Vec<&str> = m.qualified_name.split("::").collect();
                let keep = segs.len().saturating_sub(1 + usize::from(m.impl_ctx.is_some()));
                format!("  (in mod {})", segs[..keep].join("::"))
            } else {
                String::new()
            };
            eprintln!(
                "  {}) L{}-L{}   {} {}{}",
                i + 1,
                m.start_line,
                m.end_line,
                m.kind.as_str(),
                shown,
                in_mod
            );
        }
        eprintln!();
        if matches.iter().any(|m| m.impl_ctx.is_some()) {
            eprintln!(
                "Tip: Quote a Rust qualified path to disambiguate impls (e.g. '<Router as Service>::call', or '<Router>::route' for inherent), or read line range directly."
            );
        } else {
            eprintln!("Tip: Disambiguate with Type::method (e.g. Router::route) or read line range directly.");
        }
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

/// Rust-style qualified path for an impl member: `<Type as Trait>::name`
/// (trait impl) or `<Type>::name` (inherent impl).
fn impl_path(item: &Item) -> Option<String> {
    let ic = item.impl_ctx.as_ref()?;
    Some(match &ic.trait_ty {
        Some(t) => format!("<{} as {}>::{}", ic.self_ty, t, item.name),
        None => format!("<{}>::{}", ic.self_ty, item.name),
    })
}

fn norm(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect::<String>().to_lowercase()
}

/// `fmt::Display<T>` -> `display`; `&Foo<T>` -> `foo`
fn base_name(s: &str) -> String {
    let no_generics = s.split('<').next().unwrap_or(s);
    let last = no_generics.rsplit("::").next().unwrap_or(no_generics);
    norm(last.trim_start_matches('&').trim_start_matches("mut "))
}

/// Parse `<Type as Trait>::method` / `<Type>::method` into (type, trait, method).
fn parse_qualified_path(target: &str) -> Option<(String, Option<String>, String)> {
    let rest = target.trim().strip_prefix('<')?;
    let mut depth = 0usize;
    let mut close = None;
    for (i, c) in rest.char_indices() {
        match c {
            '<' => depth += 1,
            '>' if depth == 0 => {
                close = Some(i);
                break;
            }
            '>' => depth -= 1,
            _ => {}
        }
    }
    let close = close?;
    let inner = &rest[..close];
    let method = rest[close + 1..].strip_prefix("::")?.trim();
    if method.is_empty() {
        return None;
    }

    // Split at the first top-level ` as `.
    let mut depth = 0usize;
    let mut split = None;
    let bytes = inner.as_bytes();
    for (i, c) in inner.char_indices() {
        match c {
            '<' => depth += 1,
            '>' => depth = depth.saturating_sub(1),
            ' ' if depth == 0 && bytes[i..].starts_with(b" as ") => {
                split = Some(i);
                break;
            }
            _ => {}
        }
    }
    Some(match split {
        Some(i) => (
            inner[..i].trim().to_string(),
            Some(inner[i + 4..].trim().to_string()),
            method.to_string(),
        ),
        None => (inner.trim().to_string(), None, method.to_string()),
    })
}

/// Match a `<Type as Trait>::method` target against impl members.
fn find_qualified_path_matches<'a>(items: &[&'a Item], ty: &str, tr: Option<&str>, method: &str) -> Vec<&'a Item> {
    let by_impl: Vec<&Item> = items
        .iter()
        .copied()
        .filter(|it| {
            let Some(ic) = &it.impl_ctx else { return false };
            let type_ok = norm(ty) == norm(&ic.self_ty)
                || it.receiver.as_deref().is_some_and(|r| norm(ty) == norm(r) || base_name(ty) == norm(r));
            let trait_ok = match (tr, &ic.trait_ty) {
                (None, None) => true,
                // Full text (with generics) always matches; a generic-free query
                // like `Display` or `fmt::Display` matches on the trait's base name.
                (Some(q), Some(t)) => norm(q) == norm(t) || (!q.contains('<') && base_name(q) == base_name(t)),
                _ => false,
            };
            type_ok && trait_ok
        })
        .collect();
    let exact: Vec<&Item> = by_impl.iter().copied().filter(|it| it.name == method).collect();
    if !exact.is_empty() {
        return exact;
    }
    let m = method.to_lowercase();
    by_impl.into_iter().filter(|it| it.name.to_lowercase() == m).collect()
}

fn find_matches<'a>(items: &[&'a Item], target: &str) -> Vec<&'a Item> {
    if let Some((ty, tr, method)) = parse_qualified_path(target) {
        return find_qualified_path_matches(items, &ty, tr.as_deref(), &method);
    }
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

        // 3. Path-suffix match, so `Type::method` resolves to `inner::Type::method`
        //    inside an inline module.
        let suffix = format!("::{}", target_lower);
        let suf: Vec<&Item> = items
            .iter()
            .copied()
            .filter(|it| it.qualified_name.to_lowercase().ends_with(&suffix))
            .collect();
        if !suf.is_empty() {
            return suf;
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
