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
    assert!(stdout.contains("=== fixtures/broken.rs (13 lines) [! 1 syntax error] ==="));
    assert!(stdout.contains("Syntax Notice: L6: expected SEMICOLON"));
    assert!(stdout.contains("pub struct WorkingConfig"));
    assert!(stdout.contains("fn broken_function()"));
    assert!(stdout.contains("pub struct AnotherValidStruct"));
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
