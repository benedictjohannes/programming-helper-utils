use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct LineIndex {
    line_starts: Vec<u32>,
    text_len: u32,
}

impl LineIndex {
    pub fn new(text: &str) -> Self {
        let mut line_starts = vec![0];
        for (i, b) in text.as_bytes().iter().enumerate() {
            if *b == b'\n' {
                line_starts.push((i + 1) as u32);
            }
        }
        Self {
            line_starts,
            text_len: text.len() as u32,
        }
    }

    /// Convert byte offset (0-indexed) to 1-indexed (line, col).
    pub fn line_col(&self, offset: u32) -> (usize, usize) {
        match self.line_starts.binary_search(&offset) {
            Ok(idx) => (idx + 1, 1),
            Err(idx) => {
                let line = idx; // 1-indexed line
                let col = (offset - self.line_starts[idx - 1]) as usize + 1;
                (line, col)
            }
        }
    }

    /// Convert byte offset to 1-indexed line number.
    pub fn line(&self, offset: u32) -> usize {
        match self.line_starts.binary_search(&offset) {
            Ok(idx) => idx + 1,
            Err(idx) => idx,
        }
    }

    /// Number of lines; a trailing newline does not start a new line.
    pub fn line_count(&self) -> usize {
        match self.line_starts.last() {
            Some(&last) if last == self.text_len => self.line_starts.len() - 1,
            _ => self.line_starts.len(),
        }
    }
}

pub fn is_test_file_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if normalized.contains("/tests/") || normalized.starts_with("tests/") {
        return true;
    }
    path.file_name()
        .and_then(|s| s.to_str())
        .is_some_and(|n| n.ends_with("_test.rs"))
}

fn has_glob_chars(s: &str) -> bool {
    s.contains(['*', '?', '['])
}

/// Expand one CLI input into concrete paths: an existing path is used as is;
/// otherwise glob metacharacters are expanded (for shells that do not).
fn expand_input(input: &str) -> Vec<PathBuf> {
    let path = Path::new(input);
    if path.exists() {
        return vec![path.to_path_buf()];
    }
    if has_glob_chars(input)
        && let Ok(paths) = glob::glob(input) {
            let found: Vec<PathBuf> = paths.filter_map(|p| p.ok()).collect();
            if !found.is_empty() {
                return found;
            }
        }
    eprintln!("Warning: path not found: {}", input);
    Vec::new()
}

/// Skip build output (`target/` next to a `Cargo.toml`) and hidden directories
/// below the walk root.
fn is_pruned_dir(e: &walkdir::DirEntry, include_tests: bool) -> bool {
    if !e.file_type().is_dir() {
        return false;
    }
    let name = e.file_name().to_string_lossy();
    if !include_tests && name == "tests" {
        return true;
    }
    if e.depth() == 0 {
        return false;
    }
    if name.starts_with('.') {
        return true;
    }
    name == "target"
        && e.path()
            .parent()
            .is_some_and(|p| p.join("Cargo.toml").is_file())
}

pub fn collect_rust_files(inputs: &[String], include_tests: bool) -> Result<Vec<PathBuf>, std::io::Error> {
    let mut files = Vec::new();
    for input in inputs {
        for path in expand_input(input) {
            if path.is_file() {
                if !include_tests && is_test_file_path(&path) {
                    continue;
                }
                files.push(path);
            } else if path.is_dir() {
                let walker = walkdir::WalkDir::new(&path)
                    .follow_links(true)
                    .into_iter()
                    .filter_entry(|e| !is_pruned_dir(e, include_tests));
                for entry in walker {
                    let entry = match entry {
                        Ok(e) => e,
                        Err(err) => {
                            eprintln!("Warning: {}", err);
                            continue;
                        }
                    };
                    let p = entry.path();
                    if entry.file_type().is_file()
                        && p.extension().is_some_and(|ext| ext == "rs")
                        && (include_tests || !is_test_file_path(p))
                    {
                        files.push(p.to_path_buf());
                    }
                }
            }
        }
    }
    files.sort();
    files.dedup();
    Ok(files)
}
