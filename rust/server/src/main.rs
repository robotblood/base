//! base-server — the Rust port of the base personal-system API.
//!
//! Serves the same HTTP surface as the FastAPI app (app/main.py) against the
//! same Postgres database, so the SvelteKit web dashboard can point at either
//! server during the migration. See rust/README.md for what's ported and
//! what still lives on the Python side.

mod config;
mod crud;
mod db;
mod error;
mod modules;
mod system;

use std::sync::Arc;

use axum::routing::get;
use axum::Router;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "base_server=info,sqlx=warn".into()),
        )
        .init();

    let config = config::Config::load();
    let pool = db::connect(&config.database_url).await?;
    let state = Arc::new(db::init_state(pool).await?);
    tracing::info!(
        "registry loaded: {} modules against the live schema",
        state.modules.len()
    );

    // Static routes win over the {module} captures, so /health and friends
    // never shadow a module (and no module is named like them).
    let app = Router::new()
        .route("/", get(system::root))
        .route("/health", get(system::health))
        .route("/stats", get(system::stats))
        .route("/tags", get(system::tags))
        .route(
            "/settings/{key}",
            get(system::get_setting)
                .put(system::put_setting)
                .delete(system::delete_setting),
        )
        .route("/{module}", get(crud::list_items).post(crud::create_item))
        .route(
            "/{module}/{id}",
            get(crud::read_item)
                .patch(crud::update_item)
                .delete(crud::delete_item),
        )
        .with_state(state);

    let addr = format!("{}:{}", config.api_host, config.api_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("base-server v{} listening on http://{addr}", system::VERSION);
    axum::serve(listener, app).await?;
    Ok(())
}
