package repository

import (
	"challengelabs/backend/internal/models"
	"challengelabs/backend/pkg/logger"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// InitDB opens a PostgreSQL connection, runs auto-migrations, and returns the *gorm.DB.
func InitDB(dsn string, debug bool) (*gorm.DB, error) {
	logLevel := gormlogger.Silent
	if debug {
		logLevel = gormlogger.Info
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormlogger.Default.LogMode(logLevel),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)

	if err = db.AutoMigrate(
		&models.User{},
		&models.OTPCode{},
		&models.Category{},
		&models.Challenge{},
		&models.Task{},
		&models.Session{},
		&models.UserProgress{},
		&models.SiteSetting{},
	); err != nil {
		return nil, err
	}

	logger.Info("Database migrated successfully")
	return db, nil
}
