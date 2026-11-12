pub fn helper() -> u32 {
    1
}

pub mod inner {
    pub struct Widget;

    impl Widget {
        pub fn spin(&self) -> u32 {
            super::helper()
        }
    }

    pub fn helper() -> u32 {
        2
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_helper_returns_one() {
        assert_eq!(helper(), 1);
    }

    fn shared_setup() -> u32 {
        42
    }
}
