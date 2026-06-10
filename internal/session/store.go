package session

import (
	"time"

	"challengelabs/backend/internal/models"
)

// Store is the session persistence abstraction used by all handlers and the scheduler.
//
// Two implementations ship with this package:
//   - MemoryStore  — zero-dependency, in-process store; ideal for development and tests.
//   - *repository.SessionRepository — PostgreSQL-backed store for production.
//
// Both implement this interface automatically via Go's structural typing, so callers
// never import a concrete type and storage can be swapped at startup via STORE= env.
type Store interface {
	// Write operations
	Create(s *models.Session) error
	Update(s *models.Session) error
	UpdateStatus(id uint, status models.SessionStatus) error
	UpdateLastActive(id uint) error

	// Point lookups
	FindByID(id uint) (*models.Session, error)
	FindByKey(key string) (*models.Session, error)
	FindByContainerID(containerID string) (*models.Session, error)

	// Filtered reads
	FindActiveByUserAndChallenge(userID, challengeID uint) (*models.Session, error)
	FindActiveByUser(userID uint) ([]models.Session, error)
	FindActiveByAllUsers() ([]models.Session, error)

	// Scheduler / maintenance reads
	FindExpired() ([]models.Session, error)
	FindIdleExpired(idleTimeout time.Duration) ([]models.Session, error)

	// Metrics
	CountActiveSessions() (int64, error)
}
