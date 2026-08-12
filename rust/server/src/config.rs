//! Configuration, resolved the same way app/config.py does: environment
//! variables first, then a `.env` file (this directory or the repo root, so
//! the Python side's `.env` works unchanged), then defaults.

use std::path::Path;

pub struct Config {
    pub database_url: String,
    pub api_host: String,
    pub api_port: u16,
}

/// The Python side connects with SQLAlchemy's `postgresql+psycopg://` scheme;
/// SQLx wants plain `postgres(ql)://`. Accept either so one `.env` serves both.
fn normalize_db_url(url: &str) -> String {
    match url.split_once("://") {
        Some((scheme, rest)) => {
            let scheme = scheme.split_once('+').map_or(scheme, |(s, _)| s);
            format!("{scheme}://{rest}")
        }
        None => url.to_string(),
    }
}

fn from_env_file(key: &str) -> Option<String> {
    for candidate in [".env", "../.env", "../../.env"] {
        let Ok(text) = std::fs::read_to_string(Path::new(candidate)) else { continue };
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                if k.trim().eq_ignore_ascii_case(key) {
                    return Some(v.trim().trim_matches('"').trim_matches('\'').to_string());
                }
            }
        }
    }
    None
}

fn setting(key: &str) -> Option<String> {
    std::env::var(key.to_uppercase()).ok().or_else(|| from_env_file(key))
}

impl Config {
    pub fn load() -> Config {
        let database_url = setting("database_url")
            .map(|u| normalize_db_url(&u))
            .unwrap_or_else(|| "postgres://base:base@localhost:5432/base".to_string());
        // Default port is 8001 — one above the FastAPI app — so both servers
        // can run side by side while the port is being proven out. Set
        // API_PORT=8000 to take over the front end for real.
        let api_host = setting("api_host").unwrap_or_else(|| "127.0.0.1".to_string());
        let api_port = setting("rust_api_port")
            .or_else(|| setting("api_port").map(|p| p))
            .and_then(|p| p.parse().ok())
            .unwrap_or(8001);
        Config { database_url, api_host, api_port }
    }
}
