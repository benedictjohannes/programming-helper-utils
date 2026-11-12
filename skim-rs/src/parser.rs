use ra_ap_syntax::{
    ast::{self, HasAttrs, HasModuleItem, HasName},
    AstNode, SourceFile, SyntaxKind, SyntaxNode,
};
use text_size::TextRange;

use crate::fs::LineIndex;
use crate::model::{DetailMember, ImplCtx, Item, ItemKind, ParsedRustFile, SyntaxNotice};

pub fn parse_rust_file(path: &str, content: &str) -> ParsedRustFile {
    let line_index = LineIndex::new(content);
    let parse = SourceFile::parse(content, ra_ap_edition::Edition::Edition2024);
    let file = parse.tree();

    let mut syntax_errors = Vec::new();
    for err in parse.errors() {
        let range = err.range();
        let (line, col) = line_index.line_col(u32::from(range.start()));
        syntax_errors.push(SyntaxNotice {
            line,
            col,
            message: err.to_string(),
        });
    }

    let mut uses = Vec::new();
    let mut items = Vec::new();

    let ctx = Ctx {
        mod_path: &[],
        in_test_mod: false,
    };
    collect_items(file.items(), &ctx, &line_index, &mut uses, &mut items);

    let lines = content.lines().map(|s| s.to_string()).collect();

    ParsedRustFile {
        path: path.to_string(),
        total_lines: line_index.line_count(),
        uses,
        items,
        syntax_errors,
        lines,
    }
}

/// Lexical context of the item list currently being collected.
struct Ctx<'a> {
    /// Chain of enclosing inline module names (empty at file top level).
    mod_path: &'a [String],
    /// Inside a test module (items inherit `is_test`).
    in_test_mod: bool,
}

impl Ctx<'_> {
    /// Apply module prefix / depth / test inheritance and store the item.
    fn add(&self, items: &mut Vec<Item>, it: Option<Item>) {
        let Some(mut it) = it else { return };
        if !self.mod_path.is_empty() {
            it.qualified_name = format!("{}::{}", self.mod_path.join("::"), it.qualified_name);
            it.depth = self.mod_path.len();
        }
        if self.in_test_mod {
            it.is_test = true;
        }
        items.push(it);
    }
}

/// Collect items from a file or inline module body. Items inside an inline
/// module get a `mod::`-prefixed qualified name, `depth = mod_path.len()`, and
/// inherit `is_test` from a test module ancestor.
fn collect_items(
    ast_items: impl Iterator<Item = ast::Item>,
    ctx: &Ctx,
    line_index: &LineIndex,
    uses: &mut Vec<String>,
    items: &mut Vec<Item>,
) {
    for item in ast_items {
        match item {
            ast::Item::Use(u) => {
                // Only file-level uses are reported by `glance -u`.
                if ctx.mod_path.is_empty() {
                    let text = clean_use_text(&u);
                    if !text.is_empty() {
                        uses.push(text);
                    }
                }
            }
            ast::Item::Fn(f) => ctx.add(items, process_fn(&f, None, line_index)),
            ast::Item::Struct(s) => ctx.add(items, process_struct(&s, line_index)),
            ast::Item::Enum(e) => ctx.add(items, process_enum(&e, line_index)),
            ast::Item::Trait(t) => ctx.add(items, process_trait(&t, line_index)),
            ast::Item::TypeAlias(t) => ctx.add(items, process_type_alias(&t, None, line_index)),
            ast::Item::Const(c) => ctx.add(items, process_const(&c, None, line_index)),
            ast::Item::Static(s) => ctx.add(items, process_static(&s, line_index)),
            ast::Item::Module(m) => {
                if let Some(it) = process_module(&m, line_index) {
                    let mut child_path = ctx.mod_path.to_vec();
                    child_path.push(it.name.clone());
                    let child = Ctx {
                        mod_path: &child_path,
                        in_test_mod: ctx.in_test_mod || it.is_test,
                    };
                    ctx.add(items, Some(it));
                    if let Some(il) = m.item_list() {
                        collect_items(il.items(), &child, line_index, uses, items);
                    }
                }
            }
            ast::Item::MacroRules(m) => ctx.add(items, process_macro_rules(&m, line_index)),
            ast::Item::MacroDef(m) => ctx.add(items, process_macro_def(&m, line_index)),
            ast::Item::Union(u) => ctx.add(items, process_union(&u, line_index)),
            ast::Item::Impl(imp) => {
                for it in process_impl(&imp, line_index) {
                    ctx.add(items, Some(it));
                }
            }
            _ => {}
        }
    }
}

fn node_lines(node: &SyntaxNode, line_index: &LineIndex) -> (usize, usize) {
    let range = node.text_range();
    let start = line_index.line(u32::from(range.start()));
    let end = line_index.line(u32::from(range.end()));
    (start, end)
}

/// An attribute marks a test when it is `#[test]`-like (`#[test]`,
/// `#[tokio::test]`, `#[rstest]`, `#[test_case(..)]`) or a `cfg` that enables
/// `test` (`#[cfg(test)]`, `#[cfg(all(test, ..))]`). Only identifier tokens are
/// inspected, so strings such as `feature = "testing"` or doc text never match,
/// and `#[cfg(not(test))]` is regular code.
fn is_test_item<N: HasAttrs>(item: &N) -> bool {
    item.attrs().any(|attr| {
        let idents: Vec<String> = attr
            .syntax()
            .descendants_with_tokens()
            .filter_map(|e| e.into_token())
            .filter(|t| t.kind() == SyntaxKind::IDENT)
            .map(|t| t.text().to_string())
            .collect();
        if idents.iter().any(|i| i == "not") {
            return false;
        }
        idents
            .iter()
            .any(|i| i == "test" || i == "rstest" || i == "test_case")
    })
}

fn clean_use_text(u: &ast::Use) -> String {
    let s = u.syntax().text().to_string();
    let trimmed = s.trim();
    collapse_whitespace(trimmed)
}

fn collapse_whitespace(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut in_space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            if !in_space {
                result.push(' ');
                in_space = true;
            }
        } else {
            result.push(c);
            in_space = false;
        }
    }
    result
}

fn format_signature_up_to_body(node: &SyntaxNode, body_range: Option<TextRange>) -> String {
    let limit_end = match body_range {
        Some(range) => range.start(),
        None => node.text_range().end(),
    };

    let mut sig_parts = Vec::new();
    for element in node.children_with_tokens() {
        if element.text_range().start() >= limit_end {
            break;
        }

        match element.kind() {
            SyntaxKind::ATTR | SyntaxKind::COMMENT | SyntaxKind::DOC_COMMENT => continue,
            _ => {}
        }

        match element {
            ra_ap_syntax::SyntaxElement::Token(token) => {
                sig_parts.push(token.text().to_string());
            }
            ra_ap_syntax::SyntaxElement::Node(child_node) => {
                for token in child_node.descendants_with_tokens() {
                    if token.text_range().start() >= limit_end {
                        break;
                    }
                    match token.kind() {
                        SyntaxKind::ATTR | SyntaxKind::COMMENT | SyntaxKind::DOC_COMMENT => continue,
                        _ => {}
                    }
                    if let ra_ap_syntax::SyntaxElement::Token(t) = token {
                        sig_parts.push(t.text().to_string());
                    }
                }
            }
        }
    }

    let joined = sig_parts.concat();
    let trimmed = joined.trim().trim_end_matches('{').trim().trim_end_matches(';').trim();
    collapse_whitespace(trimmed)
}

fn process_fn(f: &ast::Fn, receiver_type: Option<&str>, line_index: &LineIndex) -> Option<Item> {
    let name_node = f.name()?;
    let name = name_node.text().to_string();
    let is_test = is_test_item(f);

    let (start_line, end_line) = node_lines(f.syntax(), line_index);

    let body_range = f.body().map(|b| b.syntax().text_range());
    let signature = format_signature_up_to_body(f.syntax(), body_range);

    let (kind, qualified_name, receiver) = match receiver_type {
        Some(recv) => (
            ItemKind::Method,
            format!("{}::{}", recv, name),
            Some(recv.to_string()),
        ),
        None => (ItemKind::Fn, name.clone(), None),
    };

    Some(Item {
        kind,
        name,
        receiver,
        qualified_name,
        signature,
        start_line,
        end_line,
        is_test,
        details: Vec::new(),
        depth: 0,
        impl_ctx: None,
    })
}

fn process_struct(s: &ast::Struct, line_index: &LineIndex) -> Option<Item> {
    let name = s.name()?.text().to_string();
    let (start_line, end_line) = node_lines(s.syntax(), line_index);
    let is_test = is_test_item(s);

    let field_list_range = s.field_list().map(|fl| match fl {
        ast::FieldList::RecordFieldList(rfl) => rfl.syntax().text_range(),
        ast::FieldList::TupleFieldList(tfl) => tfl.syntax().text_range(),
    });

    let signature = format_signature_up_to_body(s.syntax(), field_list_range);

    let mut details = Vec::new();
    if let Some(fl) = s.field_list() {
        match fl {
            ast::FieldList::RecordFieldList(rfl) => {
                for field in rfl.fields() {
                    let field_name = field.name().map(|n| n.text().to_string()).unwrap_or_default();
                    let field_sig = collapse_whitespace(field.syntax().text().to_string().trim().trim_end_matches(','));
                    details.push(DetailMember {
                        name: field_name,
                        signature: field_sig,
                        is_method: false,
                    });
                }
            }
            ast::FieldList::TupleFieldList(tfl) => {
                for (idx, field) in tfl.fields().enumerate() {
                    let field_sig = collapse_whitespace(field.syntax().text().to_string().trim().trim_end_matches(','));
                    details.push(DetailMember {
                        name: format!("{}", idx),
                        signature: field_sig,
                        is_method: false,
                    });
                }
            }
        }
    }

    Some(Item {
        kind: ItemKind::Struct,
        name: name.clone(),
        receiver: None,
        qualified_name: name,
        signature,
        start_line,
        end_line,
        is_test,
        details,
        depth: 0,
        impl_ctx: None,
    })
}

fn process_enum(e: &ast::Enum, line_index: &LineIndex) -> Option<Item> {
    let name = e.name()?.text().to_string();
    let (start_line, end_line) = node_lines(e.syntax(), line_index);
    let is_test = is_test_item(e);

    let variant_list_range = e.variant_list().map(|vl| vl.syntax().text_range());
    let signature = format_signature_up_to_body(e.syntax(), variant_list_range);

    let mut details = Vec::new();
    if let Some(vl) = e.variant_list() {
        for v in vl.variants() {
            let var_name = v.name().map(|n| n.text().to_string()).unwrap_or_default();
            let var_sig = collapse_whitespace(v.syntax().text().to_string().trim().trim_end_matches(','));
            details.push(DetailMember {
                name: var_name,
                signature: var_sig,
                is_method: false,
            });
        }
    }

    Some(Item {
        kind: ItemKind::Enum,
        name: name.clone(),
        receiver: None,
        qualified_name: name,
        signature,
        start_line,
        end_line,
        is_test,
        details,
        depth: 0,
        impl_ctx: None,
    })
}

fn process_trait(t: &ast::Trait, line_index: &LineIndex) -> Option<Item> {
    let name = t.name()?.text().to_string();
    let (start_line, end_line) = node_lines(t.syntax(), line_index);
    let is_test = is_test_item(t);

    let item_list_range = t.assoc_item_list().map(|ail| ail.syntax().text_range());
    let signature = format_signature_up_to_body(t.syntax(), item_list_range);

    let mut details = Vec::new();
    if let Some(ail) = t.assoc_item_list() {
        for assoc in ail.assoc_items() {
            match assoc {
                ast::AssocItem::Fn(f) => {
                    let fn_name = f.name().map(|n| n.text().to_string()).unwrap_or_default();
                    let body_range = f.body().map(|b| b.syntax().text_range());
                    let fn_sig = format_signature_up_to_body(f.syntax(), body_range);
                    details.push(DetailMember {
                        name: fn_name,
                        signature: fn_sig,
                        is_method: true,
                    });
                }
                ast::AssocItem::TypeAlias(ta) => {
                    let ta_name = ta.name().map(|n| n.text().to_string()).unwrap_or_default();
                    let ta_sig = collapse_whitespace(ta.syntax().text().to_string().trim().trim_end_matches(';'));
                    details.push(DetailMember {
                        name: ta_name,
                        signature: ta_sig,
                        is_method: false,
                    });
                }
                ast::AssocItem::Const(c) => {
                    let c_name = c.name().map(|n| n.text().to_string()).unwrap_or_default();
                    let c_sig = collapse_whitespace(c.syntax().text().to_string().trim().trim_end_matches(';'));
                    details.push(DetailMember {
                        name: c_name,
                        signature: c_sig,
                        is_method: false,
                    });
                }
                ast::AssocItem::MacroCall(m) => {
                    let m_sig = collapse_whitespace(m.syntax().text().to_string().trim());
                    details.push(DetailMember {
                        name: "".to_string(),
                        signature: m_sig,
                        is_method: false,
                    });
                }
            }
        }
    }

    Some(Item {
        kind: ItemKind::Trait,
        name: name.clone(),
        receiver: None,
        qualified_name: name,
        signature,
        start_line,
        end_line,
        is_test,
        details,
        depth: 0,
        impl_ctx: None,
    })
}

fn process_type_alias(t: &ast::TypeAlias, receiver: Option<&str>, line_index: &LineIndex) -> Option<Item> {
    let name = t.name()?.text().to_string();
    let (start_line, end_line) = node_lines(t.syntax(), line_index);
    let is_test = is_test_item(t);
    let signature = collapse_whitespace(t.syntax().text().to_string().trim().trim_end_matches(';'));

    let qualified_name = match receiver {
        Some(recv) => format!("{}::{}", recv, name),
        None => name.clone(),
    };

    Some(Item {
        kind: ItemKind::TypeAlias,
        name,
        receiver: receiver.map(|s| s.to_string()),
        qualified_name,
        signature,
        start_line,
        end_line,
        is_test,
        details: Vec::new(),
        depth: 0,
        impl_ctx: None,
    })
}

fn process_const(c: &ast::Const, receiver: Option<&str>, line_index: &LineIndex) -> Option<Item> {
    let name = c.name()?.text().to_string();
    let (start_line, end_line) = node_lines(c.syntax(), line_index);
    let is_test = is_test_item(c);
    let signature = collapse_whitespace(c.syntax().text().to_string().trim().trim_end_matches(';'));

    let qualified_name = match receiver {
        Some(recv) => format!("{}::{}", recv, name),
        None => name.clone(),
    };

    Some(Item {
        kind: ItemKind::Const,
        name,
        receiver: receiver.map(|s| s.to_string()),
        qualified_name,
        signature,
        start_line,
        end_line,
        is_test,
        details: Vec::new(),
        depth: 0,
        impl_ctx: None,
    })
}

fn process_static(s: &ast::Static, line_index: &LineIndex) -> Option<Item> {
    let name = s.name()?.text().to_string();
    let (start_line, end_line) = node_lines(s.syntax(), line_index);
    let is_test = is_test_item(s);
    let signature = collapse_whitespace(s.syntax().text().to_string().trim().trim_end_matches(';'));

    Some(Item {
        kind: ItemKind::Static,
        name: name.clone(),
        receiver: None,
        qualified_name: name,
        signature,
        start_line,
        end_line,
        is_test,
        details: Vec::new(),
        depth: 0,
        impl_ctx: None,
    })
}

fn process_module(m: &ast::Module, line_index: &LineIndex) -> Option<Item> {
    let name = m.name()?.text().to_string();
    let (start_line, end_line) = node_lines(m.syntax(), line_index);
    let is_test = is_test_item(m) || name == "tests" || name == "test";

    let item_list_range = m.item_list().map(|il| il.syntax().text_range());
    let signature = format_signature_up_to_body(m.syntax(), item_list_range);

    Some(Item {
        kind: ItemKind::Module,
        name: name.clone(),
        receiver: None,
        qualified_name: name,
        signature,
        start_line,
        end_line,
        is_test,
        details: Vec::new(),
        depth: 0,
        impl_ctx: None,
    })
}

fn process_macro_rules(m: &ast::MacroRules, line_index: &LineIndex) -> Option<Item> {
    let name = m.name()?.text().to_string();
    let (start_line, end_line) = node_lines(m.syntax(), line_index);
    let is_test = is_test_item(m);
    let signature = format!("macro_rules! {}", name);

    Some(Item {
        kind: ItemKind::Macro,
        name: name.clone(),
        receiver: None,
        qualified_name: name,
        signature,
        start_line,
        end_line,
        is_test,
        details: Vec::new(),
        depth: 0,
        impl_ctx: None,
    })
}

fn process_macro_def(m: &ast::MacroDef, line_index: &LineIndex) -> Option<Item> {
    let name = m.name()?.text().to_string();
    let (start_line, end_line) = node_lines(m.syntax(), line_index);
    let is_test = is_test_item(m);
    let signature = format!("macro {}", name);

    Some(Item {
        kind: ItemKind::Macro,
        name: name.clone(),
        receiver: None,
        qualified_name: name,
        signature,
        start_line,
        end_line,
        is_test,
        details: Vec::new(),
        depth: 0,
        impl_ctx: None,
    })
}

fn process_union(u: &ast::Union, line_index: &LineIndex) -> Option<Item> {
    let name = u.name()?.text().to_string();
    let (start_line, end_line) = node_lines(u.syntax(), line_index);
    let is_test = is_test_item(u);

    let rfl_range = u.record_field_list().map(|rfl| rfl.syntax().text_range());
    let signature = format_signature_up_to_body(u.syntax(), rfl_range);

    Some(Item {
        kind: ItemKind::Union,
        name: name.clone(),
        receiver: None,
        qualified_name: name,
        signature,
        start_line,
        end_line,
        is_test,
        details: Vec::new(),
        depth: 0,
        impl_ctx: None,
    })
}

/// Extract base type name from self_ty AST
fn extract_type_name(ty: &ast::Type) -> String {
    match ty {
        ast::Type::PathType(p) => {
            if let Some(path) = p.path()
                && let Some(segment) = path.segments().last()
                    && let Some(name_ref) = segment.name_ref() {
                        return name_ref.text().to_string();
                    }
            p.syntax().text().to_string()
        }
        ast::Type::RefType(r) => {
            if let Some(inner) = r.ty() {
                extract_type_name(&inner)
            } else {
                r.syntax().text().to_string()
            }
        }
        _ => ty.syntax().text().to_string(),
    }
}

fn process_impl(imp: &ast::Impl, line_index: &LineIndex) -> Vec<Item> {
    let mut out = Vec::new();
    let is_test = is_test_item(imp);
    let type_name = imp.self_ty().as_ref().map(extract_type_name);
    let recv = type_name.as_deref();

    let Some(ail) = imp.assoc_item_list() else {
        return out;
    };
    let (start_line, end_line) = node_lines(imp.syntax(), line_index);
    let impl_ctx = ImplCtx {
        header: format_signature_up_to_body(imp.syntax(), Some(ail.syntax().text_range())),
        start_line,
        end_line,
    };

    for assoc in ail.assoc_items() {
        let it = match assoc {
            ast::AssocItem::Fn(f) => process_fn(&f, recv, line_index),
            ast::AssocItem::Const(c) => process_const(&c, recv, line_index),
            ast::AssocItem::TypeAlias(ta) => process_type_alias(&ta, recv, line_index),
            ast::AssocItem::MacroCall(_) => None,
        };
        if let Some(mut it) = it {
            it.is_test |= is_test;
            it.impl_ctx = Some(impl_ctx.clone());
            out.push(it);
        }
    }
    out
}
