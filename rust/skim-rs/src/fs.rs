use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct LineIndex {
    line_starts: Vec<u32>,
}

impl LineIndex {
    pub fn new(text: &str) -> Self {
        let mut line_starts = vec![0];
        for (i, b) in text.as_bytes().iter().enumerate() {
            if *b == b'\n' {
                line_starts.push((i + 1) as u32);
            }
        }
        Self { line_starts }
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

    pub fn line_count(&self) -> usize {
        self.line_starts.len()
    }
}

pub fn is_test_file_path(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    if path_str.contains("/tests/") || path_str.starts_with("tests/") {
        return true;
    }
    if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
        if file_name.ends_with("_test.rs") {
            return true;
        }
    }
    false
}

pub fn collect_rust_files(inputs: &[String], include_tests: bool) -> Result<Vec<PathBuf>, std::io::Error> {
    let mut files = Vec::new();
    for input in inputs {
        let path = Path::new(input);
        if path.is_file() {
            if !include_tests && is_test_file_path(path) {
                continue;
            }
            files.push(path.to_path_buf());
        } else if path.is_dir() {
            for entry in walkdir::WalkDir::new(path)
                .follow_links(true)
                .into_iter()
                .filter_entry(|e| {
                    if !include_tests {
                        let name = e.file_name().to_string_lossy();
                        if e.file_type().is_dir() && name == "tests" {
                            return false;
                        }
                    }
                    true
                })
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    let p = entry.path();
                    if p.extension().map_or(false, |ext| ext == "rs") {
                        if !include_tests && is_test_file_path(p) {
                            continue;
                        }
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
