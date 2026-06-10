package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"challengelabs/backend/internal/container"
	"challengelabs/backend/internal/models"
	"challengelabs/backend/internal/session"
	"challengelabs/backend/internal/ws"
	"challengelabs/backend/pkg/logger"
)

// DevHandler provides development-mode HTTP endpoints that bypass JWT authentication
// and persistent storage. It is registered only when ENV=development.
//
// All actual terminal streaming goes through the same TerminalHandler.Connect()
// code path — the only difference is that auth is replaced by a DevAuth middleware
// that injects a synthetic user identity (userID=1, role="admin").
//
// Nothing in this file is throwaway: DevAuth, the session-start endpoint, and the
// /ws/dev/terminal route are legitimate infrastructure for internal smoke testing
// and will remain useful in the production codebase as integration-test tooling.
type DevHandler struct {
	store        session.Store
	containerMgr *container.Manager
	hub          *ws.Hub
}

// NewDevHandler wires the dev handler with the same dependencies as the rest of the system.
func NewDevHandler(store session.Store, mgr *container.Manager, hub *ws.Hub) *DevHandler {
	return &DevHandler{store: store, containerMgr: mgr, hub: hub}
}

// ── DevAuth middleware ────────────────────────────────────────────────────────

// DevAuth is a Gin middleware that injects a synthetic authenticated identity
// so that downstream handlers (including TerminalHandler) can run without JWT.
// Registered only on /dev/* and /ws/dev/* routes.
func DevAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("userID", uint(1))
		c.Set("username", "dev")
		c.Set("role", "admin")
		c.Next()
	}
}

// ── Start session ─────────────────────────────────────────────────────────────

type devStartResponse struct {
	SessionKey  string    `json:"session_key"`
	ContainerID string    `json:"container_id"`
	ContainerIP string    `json:"container_ip"`
	Image       string    `json:"image"`
	ExpiresAt   time.Time `json:"expires_at"`
	WSEndpoint  string    `json:"ws_endpoint"`
}

// Start spins up a container and creates an in-memory session without requiring
// a database or JWT.
//
// Query parameters:
//
//	image  — Docker image to run (default: "alpine")
//	ttl    — session lifetime in minutes (default: 60)
//
// POST /dev/sessions/start
func (h *DevHandler) Start(c *gin.Context) {
	image := c.DefaultQuery("image", "alpine")

	sessionKey, err := generateSessionKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate session key"})
		return
	}

	sess := &models.Session{
		UserID:       1, // synthetic dev user
		ChallengeID:  nil, // dev sessions have no challenge
		SessionKey:   sessionKey,
		Status:       models.SessionStatusBooting,
		ExpiresAt:    time.Now().Add(60 * time.Minute),
		LastActiveAt: time.Now(),
	}

	if err = h.store.Create(sess); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "session store: " + err.Error()})
		return
	}

	// Boot the container with a generous timeout to handle slow image pulls
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	result, err := h.containerMgr.Create(ctx, container.CreateOptions{
		Image:       image,
		SessionKey:  sessionKey,
		UserID:      1,
		ChallengeID: 0,
	})
	if err != nil {
		_ = h.store.UpdateStatus(sess.ID, models.SessionStatusError)
		logger.Error("Dev container create failed", "image", image, "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start container: " + err.Error()})
		return
	}

	sess.ContainerID = result.ContainerID
	sess.ContainerIP = result.IP
	sess.Status = models.SessionStatusActive
	if err = h.store.Update(sess); err != nil {
		logger.Warn("Dev: failed to update session", "err", err)
	}

	logger.Info("Dev session started",
		"session", sessionKey[:8],
		"container", result.ContainerID[:12],
		"image", image,
	)

	c.JSON(http.StatusCreated, devStartResponse{
		SessionKey:  sessionKey,
		ContainerID: result.ContainerID[:12],
		ContainerIP: result.IP,
		Image:       image,
		ExpiresAt:   sess.ExpiresAt,
		WSEndpoint:  "/ws/dev/terminal/" + sessionKey,
	})
}

// ── Terminate session ─────────────────────────────────────────────────────────

// Terminate stops the container and removes the session from the store.
//
// DELETE /dev/sessions/:sessionKey
func (h *DevHandler) Terminate(c *gin.Context) {
	sessionKey := c.Param("sessionKey")
	sess, _ := h.store.FindByKey(sessionKey)
	if sess == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	_ = h.store.UpdateStatus(sess.ID, models.SessionStatusTerminating)

	if sess.ContainerID != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := h.containerMgr.Stop(ctx, sess.ContainerID); err != nil {
			logger.Warn("Dev: container stop error", "err", err)
		}
	}

	_ = h.store.UpdateStatus(sess.ID, models.SessionStatusExpired)
	c.JSON(http.StatusOK, gin.H{"message": "session terminated", "session_key": sessionKey[:8]})
}
