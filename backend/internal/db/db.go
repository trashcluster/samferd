package db

import (
	"database/sql"
	"fmt"
	"os"

	_ "github.com/lib/pq"
)

// InitDB initializes and returns a database connection
func InitDB() (*sql.DB, error) {
	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")

	if dbHost == "" {
		dbHost = "localhost"
	}
	if dbPort == "" {
		dbPort = "5432"
	}
	if dbUser == "" {
		dbUser = "postgres"
	}
	if dbPassword == "" {
		dbPassword = "postgres"
	}
	if dbName == "" {
		dbName = "samferd"
	}

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	return db, nil
}

// CreateTables creates all necessary database tables
func CreateTables(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		email VARCHAR(255) UNIQUE NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		full_name VARCHAR(255) NOT NULL,
		email_verified BOOLEAN DEFAULT FALSE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS admins (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS events (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		title VARCHAR(255) NOT NULL,
		description TEXT,
		location VARCHAR(255) NOT NULL,
		start_date TIMESTAMP NOT NULL,
		end_date TIMESTAMP NOT NULL,
		available_transports JSONB DEFAULT '[]'::jsonb,
		created_by_admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS registrations (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		transport_type VARCHAR(50) NOT NULL,
		booking_reference VARCHAR(255),
		booking_details JSONB DEFAULT '{}'::jsonb,
		booking_date TIMESTAMP,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, event_id)
	);

	CREATE TABLE IF NOT EXISTS email_verification_tokens (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
		token VARCHAR(255) NOT NULL UNIQUE,
		expires_at TIMESTAMP NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
	CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
	CREATE INDEX IF NOT EXISTS idx_registrations_user_id ON registrations(user_id);
	CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
	`

	_, err := db.Exec(schema)
	return err
}
