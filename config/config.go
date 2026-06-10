package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration for the ChallengeLabs backend.
type Config struct {
	Server ServerConfig
	DB     DBConfig
	JWT    JWTConfig
	Docker DockerConfig
	WS     WSConfig
	CORS   CORSConfig
	// Store selects the session persistence backend.
	// "memory" — in-process store, no PostgreSQL required (development/test)
	// "postgres" — PostgreSQL-backed store via GORM (default)
	Store  string
}

type ServerConfig struct {
	Port string
	Env  string
}

type DBConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

type JWTConfig struct {
	Secret      string
	ExpiryHours int
}

type DockerConfig struct {
	Host                        string
	ContainerMaxLifetimeMinutes int
	ContainerIdleTimeoutMinutes int
	MemoryLimitMB               int64
	CPUQuota                    int64
}

type WSConfig struct {
	ReadBufferSize  int
	WriteBufferSize int
}

type CORSConfig struct {
	AllowedOrigins []string
}

// Load reads configuration from environment (and an optional .env file).
func Load() (*Config, error) {
	// Load .env file if present; ignore error (won't exist in production)
	_ = godotenv.Load()

	cfg := &Config{}

	cfg.Server.Port = getEnv("SERVER_PORT", "8080")
	cfg.Server.Env = getEnv("ENV", "development")

	cfg.DB.Host = getEnv("DB_HOST", "localhost")
	cfg.DB.Port = getEnv("DB_PORT", "5432")
	cfg.DB.User = getEnv("DB_USER", "postgres")
	cfg.DB.Password = getEnv("DB_PASSWORD", "postgres")
	cfg.DB.Name = getEnv("DB_NAME", "challengelabs")
	cfg.DB.SSLMode = getEnv("DB_SSLMODE", "disable")

	cfg.JWT.Secret = getEnv("JWT_SECRET", "")
	if cfg.JWT.Secret == "" {
		return nil, fmt.Errorf("JWT_SECRET must be set")
	}
	cfg.JWT.ExpiryHours = getEnvInt("JWT_EXPIRY_HOURS", 24)

	cfg.Docker.Host = getEnv("DOCKER_HOST", "unix:///var/run/docker.sock")
	cfg.Docker.ContainerMaxLifetimeMinutes = getEnvInt("CONTAINER_MAX_LIFETIME_MINUTES", 60)
	cfg.Docker.ContainerIdleTimeoutMinutes = getEnvInt("CONTAINER_IDLE_TIMEOUT_MINUTES", 15)
	cfg.Docker.MemoryLimitMB = int64(getEnvInt("CONTAINER_MEMORY_LIMIT_MB", 512))
	cfg.Docker.CPUQuota = int64(getEnvInt("CONTAINER_CPU_QUOTA", 50000))

	cfg.WS.ReadBufferSize = getEnvInt("WS_READ_BUFFER_SIZE", 4096)
	cfg.WS.WriteBufferSize = getEnvInt("WS_WRITE_BUFFER_SIZE", 4096)

	originsRaw := getEnv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
	cfg.CORS.AllowedOrigins = strings.Split(originsRaw, ",")

	cfg.Store = getEnv("STORE", "postgres")

	return cfg, nil
}

// DSN builds a PostgreSQL connection string.
func (d *DBConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=UTC",
		d.Host, d.Port, d.User, d.Password, d.Name, d.SSLMode,
	)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
