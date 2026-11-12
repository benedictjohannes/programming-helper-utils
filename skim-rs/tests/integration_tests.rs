use std::process::Command;

fn run_cmd(args: &[&str]) -> (i32, String, String) {
    let output = Command::new(env!("CARGO_BIN_EXE_skim-rs"))
        .args(args)
        .output()
        .expect("failed to execute skim-rs");
    (
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    )
}

#[test]
fn test_glance_signatures_and_imports() {
    let (code, stdout, _) = run_cmd(&["glance", "fixtures/broken.rs", "-s", "-u"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("=== fixtures/broken.rs (12 lines) [! 1 syntax error] ==="));
    assert!(stdout.contains("Syntax Notice: L6: expected SEMICOLON"));
    assert!(stdout.contains("pub struct WorkingConfig"));
    assert!(stdout.contains("fn broken_function()"));
    assert!(stdout.contains("pub struct AnotherValidStruct"));
}

#[test]
fn test_glance_doc_comments_stripped_from_signature() {
    let (code, stdout, _) = run_cmd(&["glance", "fixtures/impls.rs", "-s"]);
    assert_eq!(code, 0);
    // User struct should have a clean signature without doc comments or attributes
    assert!(stdout.contains("pub struct User"));
    assert!(!stdout.contains("///"));
}

#[test]
fn test_block_syntax_error_indication() {
    let (code, stdout, _) = run_cmd(&["block", "fixtures/broken.rs", "broken_function"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("=== fixtures/broken.rs (L5-L8) [! 1 syntax error] ==="));
    assert!(stdout.contains("Syntax Notice: L6: expected SEMICOLON"));
    assert!(stdout.contains("let x = 10"));

    // Valid struct in the same file should not report error in its header
    let (code, stdout, _) = run_cmd(&["block", "fixtures/broken.rs", "WorkingConfig"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("=== fixtures/broken.rs (L1-L3) ==="));
    assert!(!stdout.contains("[!"));
}

#[test]
fn test_casing_exact_precedence() {
    let (code, stdout_struct, _) = run_cmd(&["block", "fixtures/casing.rs", "Config"]);
    assert_eq!(code, 0);
    assert!(stdout_struct.contains("pub struct Config"));

    let (code, stdout_fn, _) = run_cmd(&["block", "fixtures/casing.rs", "config"]);
    assert_eq!(code, 0);
    assert!(stdout_fn.contains("pub fn config()"));
}

#[test]
fn test_impl_resolution() {
    let (code, stdout_inherent, _) = run_cmd(&["block", "fixtures/impls.rs", "User::new"]);
    assert_eq!(code, 0);
    assert!(stdout_inherent.contains("pub fn new(id: u64, name: String) -> Self"));

    let (code, stdout_trait, _) = run_cmd(&["block", "fixtures/impls.rs", "User::greet"]);
    assert_eq!(code, 0);
    assert!(stdout_trait.contains("fn greet(&self) -> String"));

    // Case-insensitive fallback
    let (code, stdout_ci, _) = run_cmd(&["block", "fixtures/impls.rs", "user::greet"]);
    assert_eq!(code, 0);
    assert!(stdout_ci.contains("fn greet(&self) -> String"));
}

#[test]
fn test_test_filtering() {
    let (code, stdout_no_t, _) = run_cmd(&["glance", "fixtures/tests.rs", "-s"]);
    assert_eq!(code, 0);
    assert!(stdout_no_t.contains("normal_function"));
    assert!(!stdout_no_t.contains("test_something"));
    assert!(!stdout_no_t.contains("async_test_case"));
    assert!(!stdout_no_t.contains("mod tests"));

    let (code, stdout_with_t, _) = run_cmd(&["glance", "fixtures/tests.rs", "-s", "-t"]);
    assert_eq!(code, 0);
    assert!(stdout_with_t.contains("normal_function"));
    assert!(stdout_with_t.contains("test_something"));
    assert!(stdout_with_t.contains("async_test_case"));
    assert!(stdout_with_t.contains("mod tests"));
}

#[test]
fn test_glance_filter_within_block() {
    // "let x = 10" is only inside broken_function body, not in declaration/signature
    let (code, stdout, _) = run_cmd(&["glance", "fixtures/broken.rs", "-f", "let x = 10"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("broken_function"));
    assert!(!stdout.contains("WorkingConfig"));
    assert!(!stdout.contains("AnotherValidStruct"));
}

#[test]
fn test_glance_missing_path_warns() {
    let (code, _, stderr) = run_cmd(&["glance", "fixtures/does_not_exist"]);
    assert_eq!(code, 1);
    assert!(stderr.contains("Warning: path not found: fixtures/does_not_exist"));

    // A missing path alongside a valid one still warns but succeeds.
    let (code, stdout, stderr) = run_cmd(&["glance", "fixtures/nope.rs", "fixtures/tests.rs"]);
    assert_eq!(code, 0);
    assert!(stderr.contains("Warning: path not found: fixtures/nope.rs"));
    assert!(stdout.contains("normal_function"));
}

#[test]
fn test_block_resolves_items_in_test_module() {
    // Not visible without -t
    let (code, _, _) = run_cmd(&["block", "fixtures/nested_mods.rs", "test_helper_returns_one"]);
    assert_eq!(code, 2);

    for target in ["test_helper_returns_one", "tests::test_helper_returns_one"] {
        let (code, stdout, _) = run_cmd(&["block", "fixtures/nested_mods.rs", target, "-t"]);
        assert_eq!(code, 0, "target {}", target);
        assert!(stdout.contains("(L23-L26)"), "target {}: {}", target, stdout);
        assert!(!stdout.contains("shared_setup"));
    }

    // Non-#[test] helper inside a test module is still treated as test code.
    let (code, _, _) = run_cmd(&["block", "fixtures/nested_mods.rs", "shared_setup"]);
    assert_eq!(code, 2);
    let (code, stdout, _) = run_cmd(&["block", "fixtures/nested_mods.rs", "shared_setup", "-t"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("42"));
}

#[test]
fn test_block_resolves_items_in_inline_module() {
    // Same name at top level and in `inner` -> ambiguous, listing qualified names.
    let (code, _, stderr) = run_cmd(&["block", "fixtures/nested_mods.rs", "helper"]);
    assert_eq!(code, 3);
    assert!(stderr.contains("inner::helper"));

    let (code, stdout, _) = run_cmd(&["block", "fixtures/nested_mods.rs", "inner::helper"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("(L14-L16)"));

    // Type::method resolves without the module prefix, and with it.
    for target in ["Widget::spin", "inner::Widget::spin"] {
        let (code, stdout, _) = run_cmd(&["block", "fixtures/nested_mods.rs", target]);
        assert_eq!(code, 0, "target {}", target);
        assert!(stdout.contains("pub fn spin(&self)"));
    }
}

#[test]
fn test_glance_enters_inline_modules() {
    let (code, stdout, _) = run_cmd(&["glance", "fixtures/nested_mods.rs", "-s"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("pub mod inner"), "{stdout}");
    // Members are nested one level under their module, impl members two.
    assert!(stdout.contains("   pub struct Widget"), "{stdout}");
    assert!(stdout.contains("impl Widget"), "{stdout}");
    assert!(stdout.contains("     pub fn spin(&self)"), "{stdout}");
    // Tests stay hidden by default, including everything inside `mod tests`.
    assert!(!stdout.contains("mod tests"));
    assert!(!stdout.contains("shared_setup"));

    let (_, stdout, _) = run_cmd(&["glance", "fixtures/nested_mods.rs", "-t"]);
    assert!(stdout.contains("test_helper_returns_one"), "{stdout}");
}

#[test]
fn test_glance_filter_reaches_inline_module_items() {
    let (code, stdout, _) = run_cmd(&["glance", "fixtures/nested_mods.rs", "-f", "spin"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("mod inner"), "{stdout}");
    assert!(stdout.contains("fn spin") || stdout.contains("method spin"), "{stdout}");
    assert!(!stdout.contains("struct Widget"), "{stdout}");
}

#[test]
fn test_false_positive_test_detection() {
    let (code, stdout, _) = run_cmd(&["glance", "fixtures/false_tests.rs"]);
    assert_eq!(code, 0);
    for name in ["greet", "testing_only", "test_connection", "not_test_only", "real_test"] {
        let present = stdout.contains(&format!("fn {}", name));
        assert_eq!(present, name != "real_test", "{name}: {stdout}");
    }
    assert!(!stdout.contains("inner_helper"));
}

#[test]
fn test_line_count_ignores_trailing_newline() {
    let (_, stdout, _) = run_cmd(&["glance", "fixtures/casing.rs"]);
    let n = std::fs::read_to_string("fixtures/casing.rs").unwrap().lines().count();
    assert!(stdout.contains(&format!("({} lines)", n)), "{stdout}");
}

#[test]
fn test_glob_expansion() {
    let (code, stdout, _) = run_cmd(&["glance", "fixtures/c*.rs"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("fixtures/casing.rs"));
    assert!(!stdout.contains("fixtures/impls.rs"));
}

#[test]
fn test_glance_groups_impl_members() {
    let (code, stdout, _) = run_cmd(&["glance", "fixtures/impls.rs", "-s"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("impl User"), "{stdout}");
    assert!(stdout.contains("impl Greeter for User"), "{stdout}");
    assert!(stdout.contains("    pub fn new("), "{stdout}");
}

#[test]
fn test_block_ambiguity_reports_impl_and_exit_3() {
    let (code, _, stderr) = run_cmd(&["block", "fixtures/impls.rs", "User::dup"]);
    assert_eq!(code, 3);
    assert!(stderr.starts_with("Error: ambiguous target 'User::dup' matched 2 candidates"), "{stderr}");
    assert!(stderr.contains("<User>::dup"), "{stderr}");
    assert!(stderr.contains("<User as Greeter>::dup"), "{stderr}");
    assert!(stderr.contains("Tip: Quote a Rust qualified path"), "{stderr}");
}

#[test]
fn test_include_tests_tags_test_files() {
    let (_, stdout, _) = run_cmd(&["glance", "fixtures/tests.rs", "-t"]);
    assert!(!stdout.contains("[test]")); // not a test *path*
    let (_, stdout, _) = run_cmd(&["glance", "tests/integration_tests.rs", "-t"]);
    assert!(stdout.contains("[test] ==="), "{stdout}");
}

#[test]
fn test_block_raw_and_details() {
    let (code, stdout, _) = run_cmd(&["block", "fixtures/casing.rs", "config", "--raw"]);
    assert_eq!(code, 0);
    assert!(!stdout.contains("==="));
    let (_, stdout, _) = run_cmd(&["glance", "fixtures/impls.rs", "-d"]);
    assert!(stdout.contains("| pub id: u64"), "{stdout}");
}

#[test]
fn test_method_vs_associated_fn_labels() {
    let (code, stdout, _) = run_cmd(&["glance", "fixtures/impls.rs"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("fn new"), "{stdout}"); // no self: associated fn
    assert!(stdout.contains("method id"), "{stdout}"); // &self
    assert!(stdout.contains("method greet"), "{stdout}");
}

#[test]
fn test_block_rust_qualified_paths() {
    // Inherent vs trait impl
    let (code, out, _) = run_cmd(&["block", "fixtures/impls.rs", "<User>::dup", "--raw"]);
    assert_eq!(code, 0);
    assert!(out.contains("pub fn dup"), "{out}");
    let (code, out, _) = run_cmd(&["block", "fixtures/impls.rs", "<User as Greeter>::dup", "--raw"]);
    assert_eq!(code, 0);
    assert!(!out.contains("pub fn dup") && out.contains("fn dup"), "{out}");

    // Case-insensitive; trait matched by base name; path-qualified trait text accepted
    let (code, out, _) = run_cmd(&["block", "fixtures/impls.rs", "<wrapper<T> as Debug>::FMT", "--raw"]);
    assert_eq!(code, 0, "{out}");
    let (code, _, _) = run_cmd(&["block", "fixtures/impls.rs", "<Wrapper<T> as std::fmt::Display>::fmt", "--raw"]);
    assert_eq!(code, 0);

    // Generic traits need their arguments; the error lists the exact forms
    let (code, _, err) = run_cmd(&["block", "fixtures/impls.rs", "<Wrapper<u8> as From>::from"]);
    assert_eq!(code, 3);
    assert!(err.contains("<Wrapper<u8> as From<u8>>::from") && err.contains("<Wrapper<u8> as From<u16>>::from"), "{err}");
    let (code, out, _) = run_cmd(&["block", "fixtures/impls.rs", "<Wrapper<u8> as From<u16>>::from", "--raw"]);
    assert_eq!(code, 0);
    assert!(out.contains("v as u8"), "{out}");

    // Not found
    let (code, _, _) = run_cmd(&["block", "fixtures/impls.rs", "<User as Debug>::dup"]);
    assert_eq!(code, 2);
}

#[test]
fn test_comments_never_reach_outline() {
    let (code, out, _) = run_cmd(&["glance", "fixtures/comments.rs", "-s", "-d"]);
    assert_eq!(code, 0);
    for leaked in ["//", "/*", "documented", "Port to bind", "payload", "trailing", "dead_code", "#["] {
        assert!(!out.contains(leaked), "leaked {leaked:?}:\n{out}");
    }
    assert!(out.contains("pub fn add(a: i32, b: i32) -> i32"), "{out}");
    assert!(out.contains("fn call(&self, x: u8, y: u8) -> Self::Future"), "{out}");
    assert!(out.contains("| B(u8)"), "{out}");
    assert!(out.contains("| type Future: Send") && out.contains("| const MAX: u32 = 3"), "{out}");
    assert!(out.contains("| pub port: u16") && out.contains("| pub host: String"), "{out}");
}

#[test]
fn test_span_includes_doc_comments_and_attributes() {
    let (code, out, _) = run_cmd(&["glance", "fixtures/comments.rs"]);
    assert_eq!(code, 0);
    assert!(out.contains("L1-L9        struct Config"), "{out}");
    assert!(out.contains("L30-L35      fn add"), "{out}");
    // block keeps the doc comment and comments in the body verbatim
    let (code, out, _) = run_cmd(&["block", "fixtures/comments.rs", "add", "--raw"]);
    assert_eq!(code, 0);
    assert!(out.starts_with("/// Adds numbers."), "{out}");
    assert!(out.contains("// body comment"), "{out}");
}
