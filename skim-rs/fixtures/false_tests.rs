#[doc = "the latest greeting"]
pub fn greet() {}

#[cfg(feature = "testing")]
pub fn testing_only() {}

pub fn test_connection() {}

#[cfg(not(test))]
pub fn not_test_only() {}

#[cfg(all(test, unix))]
fn real_test() {}

mod tests {
    fn inner_helper() {}
}
