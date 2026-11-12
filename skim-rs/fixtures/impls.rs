pub struct User {
    pub id: u64,
    pub name: String,
}

pub trait Greeter {
    fn greet(&self) -> String;
}

// Inherent impl
impl User {
    pub fn new(id: u64, name: String) -> Self {
        User { id, name }
    }

    pub fn id(&self) -> u64 {
        self.id
    }
}

// Trait impl
impl Greeter for User {
    fn greet(&self) -> String {
        format!("Hello, {}", self.name)
    }
}

impl User {
    pub fn dup(&self) {}
}

impl Greeter for User {
    fn dup(&self) {}
}

pub struct Wrapper<T>(T);

impl<T> std::fmt::Display for Wrapper<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result { Ok(()) }
}

impl<T> std::fmt::Debug for Wrapper<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result { Ok(()) }
}

impl From<u8> for Wrapper<u8> {
    fn from(v: u8) -> Self { Wrapper(v) }
}

impl From<u16> for Wrapper<u8> {
    fn from(v: u16) -> Self { Wrapper(v as u8) }
}
