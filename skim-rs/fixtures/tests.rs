pub fn normal_function() -> bool {
    true
}

#[test]
fn test_something() {
    assert!(true);
}

#[tokio::test]
async fn async_test_case() {
    assert_eq!(1, 1);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inner_unit_test() {
        assert!(normal_function());
    }
}
