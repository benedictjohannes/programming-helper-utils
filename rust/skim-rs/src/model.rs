#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemKind {
    Fn,
    Method,
    Struct,
    Enum,
    Trait,
    TypeAlias,
    Const,
    Static,
    Macro,
    Module,
    Union,
}

impl ItemKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ItemKind::Fn => "fn",
            ItemKind::Method => "fn",
            ItemKind::Struct => "struct",
            ItemKind::Enum => "enum",
            ItemKind::Trait => "trait",
            ItemKind::TypeAlias => "type",
            ItemKind::Const => "const",
            ItemKind::Static => "static",
            ItemKind::Macro => "macro",
            ItemKind::Module => "mod",
            ItemKind::Union => "union",
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct DetailMember {
    pub name: String,
    pub signature: String,
    pub is_method: bool,
}

#[derive(Debug, Clone)]
pub struct Item {
    pub kind: ItemKind,
    pub name: String,
    /// For methods: "Type"
    #[allow(dead_code)]
    pub receiver: Option<String>,
    /// Qualified name, e.g. "Type::method" or "name"
    pub qualified_name: String,
    pub signature: String,
    pub start_line: usize,
    pub end_line: usize,
    pub is_test: bool,
    pub details: Vec<DetailMember>,
}

#[derive(Debug, Clone)]
pub struct SyntaxNotice {
    pub line: usize,
    #[allow(dead_code)]
    pub col: usize,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct ParsedRustFile {
    pub path: String,
    pub total_lines: usize,
    pub uses: Vec<String>,
    pub items: Vec<Item>,
    pub syntax_errors: Vec<SyntaxNotice>,
    pub lines: Vec<String>,
}
