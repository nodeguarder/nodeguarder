package database

import (
	"database/sql"
	"embed"
	"fmt"
	"log"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed schema.sql
var schemaSQL embed.FS

// DB is the global database connection
var DB *sql.DB

// Init initializes the database connection and runs migrations
func Init(dbPath string) error {
	var err error
	DB, err = sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
    // Set connection pool settings for better concurrency
    DB.SetMaxOpenConns(25)
    DB.SetMaxIdleConns(25)
    DB.SetConnMaxLifetime(5 * time.Minute)

	// Enable foreign keys
	if _, err := DB.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	// Run migrations
	if err := runMigrations(); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	log.Println("✅ Database initialized")
	return nil
}

// runMigrations executes the schema SQL
func runMigrations() error {
	schema, err := schemaSQL.ReadFile("schema.sql")
	if err != nil {
		return fmt.Errorf("failed to read schema: %w", err)
	}

	if _, err := DB.Exec(string(schema)); err != nil {
		return fmt.Errorf("failed to execute schema: %w", err)
	}

	// Auto-migration for schema updates (safe for existing installs)
	if err := migrateSchema(); err != nil {
		log.Printf("Warning: Failed to migrate schema: %v", err)
		// Don't fail hard, as columns might already exist
	}

	return nil
}

// migrateSchema ensures database schema is up to date
func migrateSchema() error {
	// 1. Alert Settings Migration (Teams)
	if err := migrateAlertSettings(); err != nil {
		return err
	}

	// 2. Settings Table (Global Config)
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at INTEGER NOT NULL
	)`); err != nil {
		return fmt.Errorf("failed to create settings table: %w", err)
	}

	// 3. Processes Column in Metrics
	if err := addColumnIfNotExists("metrics", "processes", "TEXT"); err != nil {
		log.Printf("Warning: Failed to migrate metrics table: %v", err)
	}

	// 4. Configuration Column in Servers
	if err := addColumnIfNotExists("servers", "configuration", "TEXT"); err != nil {
		log.Printf("Warning: Failed to migrate servers table: %v", err)
	}

    // 5. Log Collection Columns in Servers
    if err := addColumnIfNotExists("servers", "log_request_pending", "BOOLEAN DEFAULT 0"); err != nil {
        log.Printf("Warning: Failed to add log_request_pending: %v", err)
    }
    if err := addColumnIfNotExists("servers", "log_request_time", "INTEGER"); err != nil {
        log.Printf("Warning: Failed to add log_request_time: %v", err)
    }
    if err := addColumnIfNotExists("servers", "log_file_path", "TEXT"); err != nil {
        log.Printf("Warning: Failed to add log_file_path: %v", err)
    }
    if err := addColumnIfNotExists("servers", "log_file_time", "INTEGER"); err != nil {
        log.Printf("Warning: Failed to add log_file_time: %v", err)
    }

    // 6. Stability Window Tracking
    if err := addColumnIfNotExists("servers", "last_status_change", "INTEGER"); err != nil {
        log.Printf("Warning: Failed to add last_status_change: %v", err)
    }
    // 7. Health Message (Reason)
    if err := addColumnIfNotExists("servers", "health_message", "TEXT"); err != nil {
        log.Printf("Warning: Failed to add health_message: %v", err)
    }

	// 6. Password Change Enforcement
	if err := addColumnIfNotExists("users", "password_changed", "BOOLEAN DEFAULT 0"); err != nil {
		log.Printf("Warning: Failed to add password_changed column: %v", err)
	}

	return nil
}

func migrateAlertSettings() error {
	// Check if teams_webhook_url exists
	if err := addColumnIfNotExists("alert_settings", "teams_webhook_url", "TEXT"); err != nil {
        return err
    }
    // Check if discord_webhook_url exists
    return addColumnIfNotExists("alert_settings", "discord_webhook_url", "TEXT")
}

// addColumnIfNotExists adds a column to a table if it doesn't exist
func addColumnIfNotExists(table, column, colType string) error {
	_, err := DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, colType))
	if err != nil {
		// Ignore "duplicate column name" error (SQLite)
		if err.Error() == fmt.Sprintf("duplicate column name: %s", column) {
			return nil
		}
		// Also handle errors like "duplicate column name" in different wrappers if needed
		return err
	}
	log.Printf("✅ Added column %s to table %s", column, table)
	return nil
}

// Close closes the database connection
func Close() error {
	if DB != nil {
		return DB.Close()
	}
	return nil
}
