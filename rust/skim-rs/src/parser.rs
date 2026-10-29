use ra_ap_syntax::{
    ast::{self, HasAttrs, HasModuleItem, HasName},
    AstNode, SourceFile, SyntaxNode,
};
use text_size::TextRange;

use crate::fs::LineIndex;
use crate::model::{DetailMember, Item, ItemKind, ParsedRustFile, SyntaxNotice};

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

    for item in file.items() {
        match item {
            ast::Item::Use(u) => {
                let text = clean_use_text(&u);
                if !text.is_empty() {
                    uses.push(text);
                }
            }
            ast::Item::Fn(f) => {
                if let Some(it) = process_fn(&f, None, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::Struct(s) => {
                if let Some(it) = process_struct(&s, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::Enum(e) => {
                if let Some(it) = process_enum(&e, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::Trait(t) => {
                if let Some(it) = process_trait(&t, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::TypeAlias(t) => {
                if let Some(it) = process_type_alias(&t, None, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::Const(c) => {
                if let Some(it) = process_const(&c, None, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::Static(s) => {
                if let Some(it) = process_static(&s, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::Module(m) => {
                if let Some(it) = process_module(&m, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::MacroRules(m) => {
                if let Some(it) = process_macro_rules(&m, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::MacroDef(m) => {
                if let Some(it) = process_macro_def(&m, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::Union(u) => {
                if let Some(it) = process_union(&u, &line_index) {
                    items.push(it);
                }
            }
            ast::Item::Impl(imp) => {
                process_impl(&imp, &line_index, &mut items);
            }
            _ => {}
        }
    }

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

fn node_lines(node: &SyntaxNode, line_index: &LineIndex) -> (usize, usize) {
    let range = node.text_range();
    let start = line_index.line(u32::from(range.start()));
    let end = line_index.line(u32::from(range.end()));
    (start, end)
}

fn is_test_item<N: HasAttrs>(item: &N) -> bool {
    for attr in item.attrs() {
        let text = attr.syntax().text().to_string();
        if text.contains("test") {
            return true;
        }
    }
    false
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
    let full_text = node.text().to_string();
    let sig_text = match body_range {
        Some(range) => {
            let offset_in_node = range.start() - node.text_range().start();
            let u: usize = u32::from(offset_in_node) as usize;
            if u <= full_text.len() {
                &full_text[..u]
            } else {
                &full_text
            }
        }
        None => &full_text,
    };
    // Strip trailing semicolon, braces, or whitespace
    let trimmed = sig_text.trim().trim_end_matches('{').trim().trim_end_matches(';').trim();
    collapse_whitespace(trimmed)
}

fn process_fn(f: &ast::Fn, receiver_type: Option<&str>, line_index: &LineIndex) -> Option<Item> {
    let name_node = f.name()?;
    let name = name_node.text().to_string();
    let is_test = is_test_item(f) || name.starts_with("test_");

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
    })
}

/// Extract base type name from self_ty AST
fn extract_type_name(ty: &ast::Type) -> String {
    match ty {
        ast::Type::PathType(p) => {
            if let Some(path) = p.path() {
                if let Some(segment) = path.segments().last() {
                    if let Some(name_ref) = segment.name_ref() {
                        return name_ref.text().to_string();
                    }
                }
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

fn process_impl(imp: &ast::Impl, line_index: &LineIndex, items: &mut Vec<Item>) {
    let is_test = is_test_item(imp);
    let self_ty = imp.self_ty();
    let type_name = self_ty.as_ref().map(extract_type_name);

    if let Some(ail) = imp.assoc_item_list() {
        for assoc in ail.assoc_items() {
            match assoc {
                ast::AssocItem::Fn(f) => {
                    if let Some(mut it) = process_fn(&f, type_name.as_deref(), line_index) {
                        if is_test {
                            it.is_test = true;
                        }
                        items.push(it);
                    }
                }
                ast::AssocItem::Const(c) => {
                    if let Some(mut it) = process_const(&c, type_name.as_deref(), line_index) {
                        if is_test {
                            it.is_test = true;
                        }
                        items.push(it);
                    }
                }
                ast::AssocItem::TypeAlias(ta) => {
                    if let Some(mut it) = process_type_alias(&ta, type_name.as_deref(), line_index) {
                        if is_test {
                            it.is_test = true;
                        }
                        items.push(it);
                    }
                }
                ast::AssocItem::MacroCall(_) => {}
            }
        }
    }
}
