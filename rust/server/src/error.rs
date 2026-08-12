//! One error type for every handler, shaped like FastAPI's responses
//! (`{"detail": ...}`) so the web layer can't tell the servers apart.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

pub enum ApiError {
    /// 404 — missing record or unknown module segment.
    NotFound,
    /// 422 — a create/list parameter the API refuses.
    Unprocessable(String),
    /// 500 — anything that escaped, logged like app/main.py's handler.
    Internal(anyhow::Error),
}

pub type ApiResult<T> = Result<T, ApiError>;

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            ApiError::NotFound => {
                (StatusCode::NOT_FOUND, Json(json!({"detail": "not found"}))).into_response()
            }
            ApiError::Unprocessable(detail) => {
                (StatusCode::UNPROCESSABLE_ENTITY, Json(json!({"detail": detail}))).into_response()
            }
            ApiError::Internal(err) => {
                tracing::error!("internal error: {err:#}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"detail": "internal server error"})),
                )
                    .into_response()
            }
        }
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        ApiError::Internal(err.into())
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        ApiError::Internal(err)
    }
}
