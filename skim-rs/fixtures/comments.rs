/// A documented struct.
#[derive(Debug)]
pub struct Config {
    /// Port to bind.
    pub port: u16, // trailing note
    // plain comment line
    #[allow(dead_code)]
    pub host: String, /* block */
}

/// Kinds of thing.
pub enum Kind {
    /// The first one.
    A = 1, // trailing
    /// Carries data.
    B(/* payload */ u8),
}

/// A trait with documented members.
pub trait Handler {
    /// The future type.
    type Future: Send;
    /// Max retries.
    const MAX: u32 = 3; // retry cap
    /// Runs the handler.
    fn call(&self, /* req */ x: u8, // line comment in params
        y: u8) -> Self::Future; // done
}

/// Adds numbers.
pub fn add(/* first */ a: i32, // trailing a
    b: i32 /* second */) -> /* ret */ i32 {
    // body comment
    a + b
}
