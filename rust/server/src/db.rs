//! Startup wiring against the live database.
//!
//! The Python side owns the schema (SQLModel's `create_all` plus its additive
//! column migration); this server deliberately creates nothing. Instead it
//! introspects each module table at boot and builds its CRUD SQL from the
//! columns that actually exist — the same live-schema posture the FastAPI app
//! takes, so a column added over there is picked up here with a restart.
//!
//! Writes go through `jsonb_populate_record`: the payload is bound as one
//! JSONB value and Postgres itself casts every field to the column's real type
//! (dates, timestamps, text[], JSONB documents). That keeps the handlers as
//! generic as the Python `make_crud_router` without a typed struct per table.

use std::collections::HashMap;

use anyhow::{bail, Context, Result};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};

use crate::modules::{ModuleDef, MODULES};

pub struct ModuleRuntime {
    pub def: &'static ModuleDef,
    /// Every column on the live table, in ordinal order.
    pub columns: Vec<String>,
    pub insert_sql: String,
    pub update_sql: String,
}

pub struct AppState {
    pub pool: PgPool,
    pub modules: Vec<ModuleRuntime>,
    index: HashMap<&'static str, usize>,
}

impl AppState {
    pub fn module(&self, name: &str) -> Option<&ModuleRuntime> {
        self.index.get(name).map(|&i| &self.modules[i])
    }
}

pub async fn connect(database_url: &str) -> Result<PgPool> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .context("connecting to Postgres")
}

async fn table_columns(pool: &PgPool, table: &str) -> Result<Vec<String>> {
    let rows = sqlx::query(
        "SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position",
    )
    .bind(table)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.get::<String, _>(0)).collect())
}

fn quote(col: &str) -> String {
    format!("\"{col}\"")
}

/// INSERT built around `jsonb_populate_record($1)`. The system timestamps come
/// from `now()` rather than the payload, and `source_created_at` falls back to
/// the same instant — mirroring `create_item` in app/routers, where a record
/// made in base has a known creation time and only imports leave it null.
fn build_insert(def: &ModuleDef, columns: &[String]) -> String {
    let settable: Vec<&String> = columns
        .iter()
        .filter(|c| !matches!(c.as_str(), "id" | "created_at" | "updated_at"))
        .collect();
    let targets: Vec<String> = settable.iter().map(|c| quote(c)).collect();
    let sources: Vec<String> = settable
        .iter()
        .map(|c| match c.as_str() {
            "source_created_at" => "COALESCE(r.\"source_created_at\", now())".to_string(),
            other => format!("r.{}", quote(other)),
        })
        .collect();
    format!(
        "INSERT INTO {table} AS t ({targets}, \"created_at\", \"updated_at\")\n\
         SELECT {sources}, now(), now()\n\
         FROM jsonb_populate_record(NULL::{table}, $1) AS r\n\
         RETURNING to_jsonb(t)",
        table = quote(def.table),
        targets = targets.join(", "),
        sources = sources.join(", "),
    )
}

/// UPDATE from a full merged row image ($2): the handler reads the current row
/// as JSONB, lays the payload over it, and this statement writes every
/// non-system column back — a PATCH with the same semantics as `_apply` in
/// app/routers, extras merging included.
fn build_update(def: &ModuleDef, columns: &[String]) -> String {
    let settable: Vec<String> = columns
        .iter()
        .filter(|c| !matches!(c.as_str(), "id" | "created_at" | "updated_at"))
        .map(|c| quote(c))
        .collect();
    format!(
        "UPDATE {table} AS t\n\
         SET ({targets}) = (SELECT {sources} FROM jsonb_populate_record(NULL::{table}, $2) AS r),\n\
             \"updated_at\" = now()\n\
         WHERE t.\"id\" = $1\n\
         RETURNING to_jsonb(t)",
        table = quote(def.table),
        targets = settable.join(", "),
        sources = settable.iter().map(|c| format!("r.{c}")).collect::<Vec<_>>().join(", "),
    )
}

pub async fn init_state(pool: PgPool) -> Result<AppState> {
    let mut modules = Vec::with_capacity(MODULES.len());
    let mut index = HashMap::new();
    let mut missing = Vec::new();

    for def in MODULES {
        let columns = table_columns(&pool, def.table).await?;
        if columns.is_empty() {
            missing.push(def.table);
            continue;
        }
        index.insert(def.name, modules.len());
        modules.push(ModuleRuntime {
            insert_sql: build_insert(def, &columns),
            update_sql: build_update(def, &columns),
            def,
            columns,
        });
    }

    if !missing.is_empty() {
        bail!(
            "tables missing from the database: {}. The Python side owns the schema — \
             run the FastAPI app once (or scripts/setup.sh) to create them.",
            missing.join(", ")
        );
    }
    Ok(AppState { pool, modules, index })
}
