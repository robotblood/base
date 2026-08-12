//! The generic CRUD handlers — the Rust twin of app/routers/make_crud_router.
//!
//! Same five routes per module, same shapes on the wire:
//!
//!     GET    /{module}          list (?q= search on the title column)
//!     POST   /{module}          create (title required)
//!     GET    /{module}/{id}     read one
//!     PATCH  /{module}/{id}     partial update
//!     DELETE /{module}/{id}     delete
//!
//! Rows travel as one flat JSON object with the `extras` blob (user-added
//! fields) spread in, real columns winning a name collision — identical to
//! `_flat` on the Python side, so the web never knows which server answered.

use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::db::{AppState, ModuleRuntime};
use crate::error::{ApiError, ApiResult};
use crate::modules::PROTECTED;

/// `{**extras, **row}`: spread the extras blob under the real columns.
fn flat(row: Value) -> Value {
    let Value::Object(mut row) = row else { return row };
    let extras = row.remove("extras");
    let mut out = match extras {
        Some(Value::Object(extras)) => extras,
        _ => Map::new(),
    };
    out.extend(row);
    Value::Object(out)
}

/// Split a payload into real-column writes and extras, the way `_apply` does:
/// protected keys are dropped, known columns land on the row, and anything
/// else is a user-added field collected into the extras blob.
fn apply(module: &ModuleRuntime, row: &mut Map<String, Value>, payload: Map<String, Value>) {
    let mut extras = match row.remove("extras") {
        Some(Value::Object(extras)) => extras,
        _ => Map::new(),
    };
    for (key, value) in payload {
        if PROTECTED.contains(&key.as_str()) {
            continue;
        }
        if module.columns.iter().any(|c| c == &key) {
            row.insert(key, value);
        } else {
            extras.insert(key, value);
        }
    }
    row.insert("extras".to_string(), Value::Object(extras));
}

fn resolve<'a>(state: &'a AppState, name: &str) -> ApiResult<&'a ModuleRuntime> {
    state.module(name).ok_or(ApiError::NotFound)
}

#[derive(Deserialize)]
pub struct ListParams {
    q: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

pub async fn list_items(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<Value>> {
    let module = resolve(&state, &name)?;
    let limit = params.limit.unwrap_or(500);
    if limit > 2000 {
        return Err(ApiError::Unprocessable("limit must be <= 2000".into()));
    }
    let offset = params.offset.unwrap_or(0);

    let mut sql = format!("SELECT to_jsonb(t) FROM \"{}\" AS t", module.def.table);
    if params.q.is_some() {
        sql.push_str(&format!(" WHERE t.\"{}\" ILIKE $3", module.def.title));
    }
    sql.push_str(&format!(
        " ORDER BY t.\"{}\"{} LIMIT $1 OFFSET $2",
        module.def.order_by,
        if module.def.order_desc { " DESC" } else { "" },
    ));

    let mut query = sqlx::query_scalar::<_, Value>(&sql).bind(limit).bind(offset);
    if let Some(q) = &params.q {
        query = query.bind(format!("%{}%", q.replace('%', "\\%").replace('_', "\\_")));
    }
    let rows = query.fetch_all(&state.pool).await?;
    Ok(Json(Value::Array(rows.into_iter().map(flat).collect())))
}

pub async fn create_item(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(payload): Json<Value>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let module = resolve(&state, &name)?;
    let Value::Object(payload) = payload else {
        return Err(ApiError::Unprocessable("payload must be an object".into()));
    };
    let title_ok = matches!(payload.get(module.def.title), Some(Value::String(s)) if !s.is_empty());
    if !title_ok {
        return Err(ApiError::Unprocessable(format!("'{}' is required", module.def.title)));
    }

    // Start from the model defaults the Python side applies at object
    // creation (the DB columns have none), then lay the payload over them.
    let mut row = match serde_json::from_str::<Value>(module.def.defaults) {
        Ok(Value::Object(defaults)) => defaults,
        _ => Map::new(),
    };
    row.insert("tags".into(), json!([]));
    row.insert("raw".into(), json!({}));
    row.insert("extras".into(), json!({}));
    apply(module, &mut row, payload);

    let created = sqlx::query_scalar::<_, Value>(&module.insert_sql)
        .bind(Value::Object(row))
        .fetch_one(&state.pool)
        .await?;
    Ok((StatusCode::CREATED, Json(flat(created))))
}

async fn fetch_row(state: &AppState, module: &ModuleRuntime, id: i64) -> ApiResult<Value> {
    let sql = format!("SELECT to_jsonb(t) FROM \"{}\" AS t WHERE t.\"id\" = $1", module.def.table);
    sqlx::query_scalar::<_, Value>(&sql)
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)
}

pub async fn read_item(
    State(state): State<Arc<AppState>>,
    Path((name, id)): Path<(String, i64)>,
) -> ApiResult<Json<Value>> {
    let module = resolve(&state, &name)?;
    Ok(Json(flat(fetch_row(&state, module, id).await?)))
}

pub async fn update_item(
    State(state): State<Arc<AppState>>,
    Path((name, id)): Path<(String, i64)>,
    Json(payload): Json<Value>,
) -> ApiResult<Json<Value>> {
    let module = resolve(&state, &name)?;
    let Value::Object(payload) = payload else {
        return Err(ApiError::Unprocessable("payload must be an object".into()));
    };

    // Read the current row image, merge the patch over it, write it back
    // whole. Two statements instead of Python's ORM unit-of-work, same result.
    let current = fetch_row(&state, module, id).await?;
    let Value::Object(mut row) = current else {
        return Err(ApiError::Internal(anyhow::anyhow!("row did not read back as an object")));
    };
    apply(module, &mut row, payload);

    let updated = sqlx::query_scalar::<_, Value>(&module.update_sql)
        .bind(id)
        .bind(Value::Object(row))
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(flat(updated)))
}

pub async fn delete_item(
    State(state): State<Arc<AppState>>,
    Path((name, id)): Path<(String, i64)>,
) -> ApiResult<StatusCode> {
    let module = resolve(&state, &name)?;
    let sql = format!("DELETE FROM \"{}\" WHERE \"id\" = $1", module.def.table);
    let result = sqlx::query(&sql).bind(id).execute(&state.pool).await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}
