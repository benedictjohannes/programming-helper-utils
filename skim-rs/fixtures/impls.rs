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
