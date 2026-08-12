//! The module registry — the Rust twin of `MODULES` in app/main.py.
//!
//! One entry per built-in module: its url segment, table, title/name column,
//! list ordering, and the Python-side field defaults that the FastAPI models
//! apply at object creation (the database columns carry no defaults of their
//! own, so a port has to supply them at insert time or NOT NULL columns like
//! notes.kind would reject a bare create).

/// Columns a client may never set directly. `extras` is here because clients
/// see its contents flattened — a literal "extras" key would clobber every
/// user-added value on the row at once. Mirrors `_PROTECTED` in app/routers.
pub const PROTECTED: &[&str] = &["id", "created_at", "updated_at", "extras"];

pub struct ModuleDef {
    /// URL segment and stats key, e.g. "todos".
    pub name: &'static str,
    /// Postgres table name (same as `name` today, kept separate on purpose).
    pub table: &'static str,
    /// The title/name column: search target, create-time required field.
    pub title: &'static str,
    /// List ordering column (usually the title; events sort by date).
    pub order_by: &'static str,
    pub order_desc: bool,
    /// Python-side model defaults, as a JSON object merged under the payload.
    pub defaults: &'static str,
}

const fn module(
    name: &'static str,
    title: &'static str,
    order_by: &'static str,
    order_desc: bool,
    defaults: &'static str,
) -> ModuleDef {
    ModuleDef { name, table: name, title, order_by, order_desc, defaults }
}

/// Mirrors app/main.py MODULES + ORDER_OVERRIDES, in the same order (the
/// order shows in `/` and `/stats`).
pub const MODULES: &[ModuleDef] = &[
    module("todos", "title", "title", false, r#"{"status": "To Do"}"#),
    module("notes", "title", "title", false, r#"{"kind": "note", "attendees": []}"#),
    module("events", "title", "starts_at", true, r#"{"all_day": false, "kind": "event"}"#),
    module("hardware", "name", "name", false, r#"{"quantity": 1}"#),
    module("software", "name", "name", false, "{}"),
    module("projects", "name", "name", false,
        r#"{"phases": [], "milestones": [], "journal": [], "people": [], "linked": [], "activity": [], "details": {}}"#),
    module("media", "title", "title", false, "{}"),
    module("people", "name", "name", false, "{}"),
    module("merch", "name", "name", false, r#"{"stock": 0}"#),
    module("applications", "role", "role", false, "{}"),
    module("transactions", "name", "name", false, "{}"),
    module("budgets", "name", "name", false, "{}"),
    module("learning", "name", "name", false, "{}"),
    module("incidents", "title", "title", false, "{}"),
    module("collections", "title", "title", false, "{}"),
];
