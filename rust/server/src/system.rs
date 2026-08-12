//! The system endpoints from app/main.py and app/health.py that aren't
//! per-module CRUD: `/`, `/health`, `/stats`, `/tags`, `/settings/{key}`.

use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;

use crate::db::AppState;
use crate::error::ApiResult;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub async fn root(State(state): State<Arc<AppState>>) -> Json<Value> {
    let modules: Vec<&str> = state.modules.iter().map(|m| m.def.name).collect();
    Json(json!({"service": "base", "modules": modules}))
}

/// Database reachability and footprint — the same reading app/health.py takes,
/// estimates and all (`reltuples` rather than `count(*)`: this gets polled,
/// exact counts already live at /stats).
async fn db_health(state: &AppState) -> Value {
    let started = Utc::now();
    let result: Result<Value, sqlx::Error> = async {
        let row = sqlx::query(
            "SELECT current_database(),
                    current_setting('server_version'),
                    pg_database_size(current_database()),
                    (SELECT count(*) FROM pg_stat_activity
                      WHERE datname = current_database()),
                    current_setting('max_connections')::bigint,
                    pg_postmaster_start_time()",
        )
        .fetch_one(&state.pool)
        .await?;
        let tables: Vec<Value> = sqlx::query(
            "SELECT c.relname, GREATEST(c.reltuples::bigint, 0), pg_total_relation_size(c.oid)
               FROM pg_class c
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relkind = 'r' AND n.nspname = 'public'
              ORDER BY pg_total_relation_size(c.oid) DESC",
        )
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .map(|r| {
            json!({
                "table": r.get::<String, _>(0),
                "est_rows": r.get::<i64, _>(1),
                "bytes": r.get::<i64, _>(2),
            })
        })
        .collect();
        Ok(json!({
            "ok": true,
            "database": row.get::<String, _>(0),
            "version": row.get::<String, _>(1),
            "size_bytes": row.get::<i64, _>(2),
            "connections": row.get::<i64, _>(3),
            "max_connections": row.get::<i64, _>(4),
            "started_at": row.get::<chrono::DateTime<Utc>, _>(5).to_rfc3339(),
            "tables": tables,
            "query_ms": (Utc::now() - started).num_milliseconds(),
            "checked_at": started.to_rfc3339(),
        }))
    }
    .await;
    result.unwrap_or_else(|err| {
        json!({
            "ok": false,
            "error": err.to_string(),
            "checked_at": started.to_rfc3339(),
        })
    })
}

pub async fn health(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({
        "api": {"ok": true, "version": VERSION},
        "db": db_health(&state).await,
    }))
}

/// Row counts per module, plus the sidebar's Assist badge. The suggestions
/// table belongs to the assist lane the Python side still owns, so its count
/// is best-effort: a database that never ran assist reads 0, not 500.
pub async fn stats(State(state): State<Arc<AppState>>) -> ApiResult<Json<Value>> {
    let mut out = serde_json::Map::new();
    for module in &state.modules {
        let sql = format!("SELECT count(*) FROM \"{}\"", module.def.table);
        let n: i64 = sqlx::query_scalar(&sql).fetch_one(&state.pool).await?;
        out.insert(module.def.name.to_string(), json!(n));
    }
    let pending: i64 =
        sqlx::query_scalar("SELECT count(*) FROM suggestions WHERE status = 'pending'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    out.insert("_assist_pending".to_string(), json!(pending));
    Ok(Json(Value::Object(out)))
}

#[derive(Deserialize)]
pub struct TagParams {
    module: Option<String>,
}

/// Distinct tags already in use, most-used first — one grouped query over a
/// UNION ALL instead of Python's per-module loop, same list out.
pub async fn tags(
    State(state): State<Arc<AppState>>,
    Query(params): Query<TagParams>,
) -> ApiResult<Json<Value>> {
    let selects: Vec<String> = state
        .modules
        .iter()
        .filter(|m| params.module.as_deref().is_none_or(|only| only == m.def.name))
        .map(|m| format!("SELECT unnest(\"tags\") AS tag FROM \"{}\"", m.def.table))
        .collect();
    if selects.is_empty() {
        return Ok(Json(json!([])));
    }
    let sql = format!(
        "SELECT tag FROM ({}) AS s WHERE tag <> ''
         GROUP BY tag ORDER BY count(*) DESC, lower(tag) ASC",
        selects.join(" UNION ALL ")
    );
    let rows: Vec<String> = sqlx::query_scalar(&sql).fetch_all(&state.pool).await?;
    Ok(Json(json!(rows)))
}

pub async fn get_setting(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
) -> ApiResult<Json<Value>> {
    // Empty rather than 404 when nothing has been saved, so "never saved" and
    // "saved as defaults" behave identically for callers (see app/main.py).
    let value: Option<Value> = sqlx::query_scalar("SELECT value FROM settings WHERE key = $1")
        .bind(&key)
        .fetch_optional(&state.pool)
        .await?;
    Ok(Json(value.unwrap_or_else(|| json!({}))))
}

pub async fn put_setting(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
    Json(value): Json<Value>,
) -> ApiResult<Json<Value>> {
    let stored: Value = sqlx::query_scalar(
        "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
         RETURNING value",
    )
    .bind(&key)
    .bind(&value)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(stored))
}

pub async fn delete_setting(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
) -> ApiResult<StatusCode> {
    sqlx::query("DELETE FROM settings WHERE key = $1")
        .bind(&key)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
