package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"challengelabs/backend/config"
	"challengelabs/backend/internal/container"
	"challengelabs/backend/internal/middleware"
	"challengelabs/backend/internal/models"
	"challengelabs/backend/internal/repository"
	"challengelabs/backend/internal/session"
	"challengelabs/backend/pkg/logger"
)

// SessionHandler manages the lifecycle of container sessions:
// start, terminate, status, stats, reconnect, list.
type SessionHandler struct {
	store         session.Store
	challengeRepo *repository.ChallengeRepository
	containerMgr  *container.Manager
	cfg           *config.Config
}

func NewSessionHandler(
	store session.Store,
	challengeRepo *repository.ChallengeRepository,
	containerMgr *container.Manager,
	cfg *config.Config,
) *SessionHandler {
	return &SessionHandler{
		store:         store,
		challengeRepo: challengeRepo,
		containerMgr:  containerMgr,
		cfg:           cfg,
	}
}

// ─── Start ────────────────────────────────────────────────────────────────────

// Start creates a session for the given challenge, spins up the Docker container,
// and returns the session key needed to open a WebSocket terminal.
func (h *SessionHandler) Start(c *gin.Context) {
	challengeID, err := strconv.ParseUint(c.Param("challengeID"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid challenge id"})
		return
	}
	userID := middleware.GetUserID(c)

	challenge, _ := h.challengeRepo.FindByID(uint(challengeID))
	if challenge == nil || !challenge.IsPublished {
		c.JSON(http.StatusNotFound, gin.H{"error": "challenge not found"})
		return
	}

	// Reuse an existing active session if the container is still running
	existing, _ := h.store.FindActiveByUserAndChallenge(userID, uint(challengeID))
	if existing != nil {
		running, _ := h.containerMgr.IsRunning(context.Background(), existing.ContainerID)
		if running {
			c.JSON(http.StatusOK, sessionResponse(existing))
			return
		}
		_ = h.store.UpdateStatus(existing.ID, models.SessionStatusExpired)
	}

	sessionKey, err := generateSessionKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate session key"})
		return
	}

	lifetime := time.Duration(h.cfg.Docker.ContainerMaxLifetimeMinutes) * time.Minute
	challengeIDVal := uint(challengeID)
	sess := &models.Session{
		UserID:       userID,
		ChallengeID:  &challengeIDVal,
		SessionKey:   sessionKey,
		Status:       models.SessionStatusBooting,
		ExpiresAt:    time.Now().Add(lifetime),
		LastActiveAt: time.Now(),
	}
	if err = h.store.Create(sess); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	result, err := h.containerMgr.Create(ctx, container.CreateOptions{
		Image:       challenge.DockerImage,
		SessionKey:  sessionKey,
		UserID:      userID,
		ChallengeID: uint(challengeID),
	})
	if err != nil {
		_ = h.store.UpdateStatus(sess.ID, models.SessionStatusError)
		logger.Error("Container creation failed", "err", err, "session", sessionKey[:8])
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start container: " + err.Error()})
		return
	}

	sess.ContainerID = result.ContainerID
	sess.ContainerIP = result.IP
	sess.Status = models.SessionStatusActive
	if err = h.store.Update(sess); err != nil {
		logger.Error("Failed to update session", "err", err)
	}

	logger.Info("Session started",
		"user", userID, "challenge", challengeID,
		"session", sessionKey[:8], "container", result.ContainerID[:12],
	)
	c.JSON(http.StatusCreated, sessionResponse(sess))
}

// ─── Terminate ────────────────────────────────────────────────────────────────

func (h *SessionHandler) Terminate(c *gin.Context) {
	sess, ok := h.resolveUserSession(c)
	if !ok {
		return
	}
	if err := h.terminateSession(sess); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to terminate session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "session terminated"})
}

// ─── Status ───────────────────────────────────────────────────────────────────

func (h *SessionHandler) Status(c *gin.Context) {
	sess, ok := h.resolveUserSession(c)
	if !ok {
		return
	}
	running, _ := h.containerMgr.IsRunning(context.Background(), sess.ContainerID)
	if !running && sess.Status == models.SessionStatusActive {
		_ = h.store.UpdateStatus(sess.ID, models.SessionStatusExpired)
		sess.Status = models.SessionStatusExpired
	}
	resp := sessionResponse(sess)
	resp["running"] = running
	c.JSON(http.StatusOK, resp)
}

// ─── ListActive ───────────────────────────────────────────────────────────────

func (h *SessionHandler) ListActive(c *gin.Context) {
	userID := middleware.GetUserID(c)
	sessions, err := h.store.FindActiveByUser(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch sessions"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sessions": sessions, "total": len(sessions)})
}

// ─── Reconnect ────────────────────────────────────────────────────────────────

func (h *SessionHandler) Reconnect(c *gin.Context) {
	challengeID, err := strconv.ParseUint(c.Param("challengeID"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid challenge id"})
		return
	}
	userID := middleware.GetUserID(c)

	sess, _ := h.store.FindActiveByUserAndChallenge(userID, uint(challengeID))
	if sess == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active session"})
		return
	}
	running, _ := h.containerMgr.IsRunning(context.Background(), sess.ContainerID)
	if !running {
		_ = h.store.UpdateStatus(sess.ID, models.SessionStatusExpired)
		c.JSON(http.StatusGone, gin.H{"error": "container no longer running"})
		return
	}
	c.JSON(http.StatusOK, sessionResponse(sess))
}

// ─── Stats ────────────────────────────────────────────────────────────────────

func (h *SessionHandler) Stats(c *gin.Context) {
	sess, ok := h.resolveUserSession(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	stats, err := h.containerMgr.Stats(ctx, sess.ContainerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get stats"})
		return
	}

	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(stats.CPUStats.SystemUsage - stats.PreCPUStats.SystemUsage)
	cpuPct := 0.0
	if sysDelta > 0 {
		cpuPct = (cpuDelta / sysDelta) * float64(len(stats.CPUStats.CPUUsage.PercpuUsage)) * 100
	}
	memUsage := stats.MemoryStats.Usage - stats.MemoryStats.Stats["cache"]
	memLimit := stats.MemoryStats.Limit
	memPct := 0.0
	if memLimit > 0 {
		memPct = float64(memUsage) / float64(memLimit) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"cpu_percent":    cpuPct,
		"memory_usage":   memUsage,
		"memory_limit":   memLimit,
		"memory_percent": memPct,
	})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (h *SessionHandler) terminateSession(s *models.Session) error {
	_ = h.store.UpdateStatus(s.ID, models.SessionStatusTerminating)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if s.ContainerID != "" {
		if err := h.containerMgr.Stop(ctx, s.ContainerID); err != nil {
			logger.Warn("Container stop error", "id", s.ContainerID[:12], "err", err)
		}
	}
	return h.store.UpdateStatus(s.ID, models.SessionStatusExpired)
}

func (h *SessionHandler) resolveUserSession(c *gin.Context) (*models.Session, bool) {
	sessionKey := c.Param("sessionKey")
	if sessionKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session key required"})
		return nil, false
	}
	sess, _ := h.store.FindByKey(sessionKey)
	if sess == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return nil, false
	}
	if sess.UserID != middleware.GetUserID(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return nil, false
	}
	return sess, true
}

func sessionResponse(s *models.Session) gin.H {
	return gin.H{
		"id":           s.ID,
		"session_key":  s.SessionKey,
		"challenge_id": s.ChallengeID,
		"status":       s.Status,
		"container_ip": s.ContainerIP,
		"expires_at":   s.ExpiresAt,
		"remaining":    s.RemainingSeconds(),
		"created_at":   s.CreatedAt,
	}
}
