use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn create_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(50)
        .connect(database_url)
        .await
        .expect("Failed to create database pool")
}

pub async fn run_migrations(pool: &PgPool) {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .expect("Failed to run database migrations");
}

pub async fn update_admin_password(pool: &PgPool, password: &str) {
    let hash = bcrypt::hash(password, 12).expect("Failed to hash admin password");
    sqlx::query("UPDATE users SET password_hash = $1 WHERE email = 'admin@nodeguarder.local'")
        .bind(&hash)
        .execute(pool)
        .await
        .expect("Failed to update admin password");
    tracing::info!("Admin password updated from ADMIN_PASSWORD env var");
}
