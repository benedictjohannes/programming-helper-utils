pub struct Config {
    pub timeout: u64,
}

pub fn config() -> Config {
    Config { timeout: 30 }
}
