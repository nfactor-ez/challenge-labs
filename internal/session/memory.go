package session

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"challengelabs/backend/internal/models"
)

// MemoryStore is a goroutine-safe, zero-dependency session store backed by an in-process map.
//
// It satisfies the session.Store interface and is a drop-in replacement for the PostgreSQL
// repository in environments where a database is not available (local development, CI, single-node
// edge deployments). Sessions are lost on process restart; no persistence is provided.
//
// Thread-safety: all exported methods are safe for concurrent use.
type MemoryStore struct {
	mu       sync.RWMutex
	sessions map[uint]*models.Session
	nextID   uint64 // accessed atomically
}

// NewMemoryStore returns an initialised, empty MemoryStore.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		sessions: make(map[uint]*models.Session),
	}
}

// ── Write operations ──────────────────────────────────────────────────────────

// Create assigns a new auto-incremented ID, sets timestamps, and stores a copy
// of the session. The session value is updated in place with the assigned ID.
func (m *MemoryStore) Create(s *models.Session) error {
	id := uint(atomic.AddUint64(&m.nextID, 1))
	now := time.Now()
	s.ID = id
	s.CreatedAt = now
	s.UpdatedAt = now
	if s.LastActiveAt.IsZero() {
		s.LastActiveAt = now
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	cp := *s
	m.sessions[id] = &cp
	return nil
}

// Update replaces the stored session with a copy of s (preserving CreatedAt).
func (m *MemoryStore) Update(s *models.Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	existing, ok := m.sessions[s.ID]
	if !ok {
		return fmt.Errorf("session %d not found", s.ID)
	}
	cp := *s
	cp.CreatedAt = existing.CreatedAt
	cp.UpdatedAt = time.Now()
	m.sessions[s.ID] = &cp
	return nil
}

// UpdateStatus changes the status field of the given session.
func (m *MemoryStore) UpdateStatus(id uint, status models.SessionStatus) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	s, ok := m.sessions[id]
	if !ok {
		return fmt.Errorf("session %d not found", id)
	}
	s.Status = status
	s.UpdatedAt = time.Now()
	return nil
}

// UpdateLastActive refreshes the LastActiveAt timestamp (used by the idle reaper).
func (m *MemoryStore) UpdateLastActive(id uint) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[id]; ok {
		s.LastActiveAt = time.Now()
	}
	return nil
}

// ── Point lookups ─────────────────────────────────────────────────────────────

// FindByID returns a copy of the session with the given ID, or nil if not found.
func (m *MemoryStore) FindByID(id uint) (*models.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	s, ok := m.sessions[id]
	if !ok {
		return nil, nil
	}
	cp := *s
	return &cp, nil
}

// FindByKey returns a copy of the session with the given session key, or nil.
func (m *MemoryStore) FindByKey(key string) (*models.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, s := range m.sessions {
		if s.SessionKey == key {
			cp := *s
			return &cp, nil
		}
	}
	return nil, nil
}

// FindByContainerID returns a copy of the session with the given container ID, or nil.
func (m *MemoryStore) FindByContainerID(containerID string) (*models.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, s := range m.sessions {
		if s.ContainerID == containerID {
			cp := *s
			return &cp, nil
		}
	}
	return nil, nil
}

// ── Filtered reads ────────────────────────────────────────────────────────────

// FindActiveByUserAndChallenge returns a live session for the given user + challenge, or nil.
func (m *MemoryStore) FindActiveByUserAndChallenge(userID, challengeID uint) (*models.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	now := time.Now()
	for _, s := range m.sessions {
		if s.UserID == userID &&
			s.ChallengeID != nil && *s.ChallengeID == challengeID &&
			isActiveStatus(s.Status) && s.ExpiresAt.After(now) {
			cp := *s
			return &cp, nil
		}
	}
	return nil, nil
}

// FindActiveByUser returns all live sessions owned by the given user.
func (m *MemoryStore) FindActiveByUser(userID uint) ([]models.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	now := time.Now()
	var out []models.Session
	for _, s := range m.sessions {
		if s.UserID == userID && isActiveStatus(s.Status) && s.ExpiresAt.After(now) {
			out = append(out, *s)
		}
	}
	return out, nil
}

// FindActiveByAllUsers returns all sessions in active status that have not expired.
// Used by the scheduler to broadcast expiry warnings.
func (m *MemoryStore) FindActiveByAllUsers() ([]models.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	now := time.Now()
	var out []models.Session
	for _, s := range m.sessions {
		if s.Status == models.SessionStatusActive && s.ExpiresAt.After(now) {
			out = append(out, *s)
		}
	}
	return out, nil
}

// ── Scheduler / maintenance reads ────────────────────────────────────────────

// FindExpired returns all booting/active sessions whose TTL has elapsed.
func (m *MemoryStore) FindExpired() ([]models.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	now := time.Now()
	var out []models.Session
	for _, s := range m.sessions {
		if isActiveStatus(s.Status) && !s.ExpiresAt.After(now) {
			out = append(out, *s)
		}
	}
	return out, nil
}

// FindIdleExpired returns all active sessions whose last activity timestamp is
// older than the given idle timeout, indicating an abandoned terminal.
func (m *MemoryStore) FindIdleExpired(idleTimeout time.Duration) ([]models.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cutoff := time.Now().Add(-idleTimeout)
	var out []models.Session
	for _, s := range m.sessions {
		if s.Status == models.SessionStatusActive && s.LastActiveAt.Before(cutoff) {
			out = append(out, *s)
		}
	}
	return out, nil
}

// ── Metrics ───────────────────────────────────────────────────────────────────

// CountActiveSessions returns the number of sessions in booting or active status.
func (m *MemoryStore) CountActiveSessions() (int64, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var n int64
	for _, s := range m.sessions {
		if isActiveStatus(s.Status) {
			n++
		}
	}
	return n, nil
}

// ── Internal helpers ──────────────────────────────────────────────────────────

func isActiveStatus(status models.SessionStatus) bool {
	return status == models.SessionStatusBooting || status == models.SessionStatusActive
}
