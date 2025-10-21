package database

import (
	"fmt"
	"os"
	"time"

	"github.com/pion/logging"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

// Init initializes the GORM database connection
func Init(logger logging.LeveledLogger) error {
	// Get database URL from environment or use default
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		// Format: postgres://user:password@host:port/dbname?sslmode=disable
		user := os.Getenv("DB_USER")
		if user == "" {
			user = "husain"
		}
		password := os.Getenv("DB_PASSWORD")
		if password == "" {
			password = "tt55oo77"
		}
		host := os.Getenv("DB_HOST")
		if host == "" {
			host = "149.200.251.12"
		}
		port := os.Getenv("DB_PORT")
		if port == "" {
			port = "5432"
		}
		dbname := os.Getenv("DB_NAME")
		if dbname == "" {
			dbname = "aqlgo"
		}

		dbURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, password, host, port, dbname)
		logger.Infof("🔗 Connecting to database at %s...", host)
	}

	var err error
	DB, err = gorm.Open(postgres.Open(dbURL), &gorm.Config{})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Get underlying SQL DB to configure connection pool
	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get database instance: %w", err)
	}

	// Set connection pool settings
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)

	logger.Infof("✅ Database connection successful")
	
	// Run migrations
	if err := runMigrations(logger); err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}

	return nil
}

// runMigrations runs all database migrations
func runMigrations(logger logging.LeveledLogger) error {
	logger.Infof("Running database migrations...")

	// Auto-migrate all models
	err := DB.AutoMigrate(
		&Company{},
		&Token{},
		&Room{},
		&Session{},
		&APIKey{},
		&AuditLog{},
		&RateLimitTracker{},
	)

	if err != nil {
		return fmt.Errorf("auto migration failed: %w", err)
	}

	// Create unique index for (company_id, room_id) in rooms table
	if !DB.Migrator().HasIndex(&Room{}, "idx_company_room") {
		if err := DB.Migrator().CreateIndex(&Room{}, "company_id, room_id"); err != nil {
			logger.Warnf("Failed to create compound index: %v", err)
		}
	}

	logger.Infof("✅ Database migrations completed successfully")
	return nil
}

// Close closes the database connection
func Close() error {
	if DB != nil {
		sqlDB, err := DB.DB()
		if err != nil {
			return err
		}
		return sqlDB.Close()
	}
	return nil
}
