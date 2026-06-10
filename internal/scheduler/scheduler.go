package scheduler

import (
	"context"
	"time"

	"github.com/robfig/cron/v3"

	"challengelabs/backend/config"
	"challengelabs/backend/internal/container"
	"challengelabs/backend/internal/models"
	"challengelabs/backend/internal/session"
	"challengelabs/backend/internal/ws"
	"challengelabs/backend/pkg/logger"
)

// Scheduler runs background maintenance jobs for the session lifecycle.
// It operates against any session.Store implementation, so it works in both
// memory-store (dev) and PostgreSQL (prod) modes without modification.
type Scheduler struct {
	cron         *cron.Cron
	store        session.Store
	containerMgr *container.Manager
	hub          *ws.Hub
	cfg          *config.Config
}

// New creates a Scheduler with the given dependencies. Call Start() to begin.
func New(
	store session.Store,
	containerMgr *container.Manager,
	hub *ws.Hub,
	cfg *config.Config,
) *Scheduler {
	return &Scheduler{
		cron:         cron.New(cron.WithSeconds()),
		store:        store,
		containerMgr: containerMgr,
		hub:          hub,
		cfg:          cfg,
	}
}

// Start registers all cron jobs and launches the scheduler loop.
func (s *Scheduler) Start() {
	// Reap sessions whose TTL has elapsed
	_, _ = s.cron.AddFunc("*/30 * * * * *", s.reapExpiredSessions)

	// Reap sessions idle longer than ContainerIdleTimeoutMinutes
	_, _ = s.cron.AddFunc("0 */2 * * * *", s.reapIdleSessions)

	// Push expiry countdown to all connected WebSocket clients
	_, _ = s.cron.AddFunc("*/30 * * * * *", s.broadcastExpiryWarnings)

	s.cron.Start()
	logger.Info("Scheduler started")
}

// Stop gracefully shuts the scheduler down, waiting for in-flight jobs.
func (s *Scheduler) Stop() {
	ctx := s.cron.Stop()
	<-ctx.Done()
	logger.Info("Scheduler stopped")
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

func (s *Scheduler) reapExpiredSessions() {
	sessions, err := s.store.FindExpired()
	if err != nil {
		logger.Error("Scheduler: FindExpired", "err", err)
		return
	}
	for _, sess := range sessions {
		s.terminateAndNotify(&sess, "TTL exceeded")
	}
}

func (s *Scheduler) reapIdleSessions() {
	idleTimeout := time.Duration(s.cfg.Docker.ContainerIdleTimeoutMinutes) * time.Minute
	sessions, err := s.store.FindIdleExpired(idleTimeout)
	if err != nil {
		logger.Error("Scheduler: FindIdleExpired", "err", err)
		return
	}
	for _, sess := range sessions {
		s.terminateAndNotify(&sess, "idle timeout")
	}
}

func (s *Scheduler) broadcastExpiryWarnings() {
	sessions, err := s.store.FindActiveByAllUsers()
	if err != nil {
		return
	}
	for _, sess := range sessions {
		rem := sess.RemainingSeconds()
		s.hub.Broadcast(sess.SessionKey, ws.ServerMessage{
			Type:      ws.MsgTypeExpiry,
			Remaining: rem,
		})
		if rem == 0 {
			s.hub.Broadcast(sess.SessionKey, ws.ServerMessage{
				Type:   ws.MsgTypeStatus,
				Status: "expired",
			})
		}
	}
}

// ── Helper ────────────────────────────────────────────────────────────────────

func (s *Scheduler) terminateAndNotify(sess *models.Session, reason string) {
	logger.Info("Terminating session", "session", sess.SessionKey[:8], "reason", reason)
	_ = s.store.UpdateStatus(sess.ID, models.SessionStatusTerminating)

	s.hub.Broadcast(sess.SessionKey, ws.ServerMessage{
		Type:   ws.MsgTypeStatus,
		Status: "expired",
		Error:  reason,
	})

	if sess.ContainerID != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.containerMgr.Stop(ctx, sess.ContainerID); err != nil {
			logger.Warn("Scheduler: container stop error",
				"container", sess.ContainerID[:12], "err", err)
		}
	}
	_ = s.store.UpdateStatus(sess.ID, models.SessionStatusExpired)
}
