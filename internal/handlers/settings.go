package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"challengelabs/backend/internal/repository"
)

// SettingsHandler exposes site-wide configuration to admins and a public
// read-only endpoint the frontend uses for feature flags (e.g. leaderboard).
type SettingsHandler struct {
	repo *repository.SettingsRepository
}

func NewSettingsHandler(repo *repository.SettingsRepository) *SettingsHandler {
	return &SettingsHandler{repo: repo}
}

// ─── Default setting keys ──────────────────────────────────────────────────────

const (
	KeyLeaderboardEnabled = "leaderboard_enabled"
)

// ─── Public: feature flags ────────────────────────────────────────────────────

// PublicSettings returns feature flags the frontend needs before login.
// GET /api/v1/settings  (no auth required)
func (h *SettingsHandler) PublicSettings(c *gin.Context) {
	leaderboard := h.repo.Get(KeyLeaderboardEnabled, "true")
	c.JSON(http.StatusOK, gin.H{
		"leaderboard_enabled": leaderboard == "true",
	})
}

// ─── Admin: read all ──────────────────────────────────────────────────────────

// List returns all settings (admin only).
// GET /api/v1/admin/settings
func (h *SettingsHandler) List(c *gin.Context) {
	settings, err := h.repo.All()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load settings"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"settings": settings})
}

// ─── Admin: update ────────────────────────────────────────────────────────────

type updateSettingRequest struct {
	Value string `json:"value" binding:"required"`
}

// Update sets a single setting value (admin only).
// PATCH /api/v1/admin/settings/:key
func (h *SettingsHandler) Update(c *gin.Context) {
	key := c.Param("key")
	// Allowlist to prevent arbitrary key injection
	allowed := map[string]bool{
		KeyLeaderboardEnabled: true,
	}
	if !allowed[key] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown setting key: " + key})
		return
	}
	var req updateSettingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.Set(key, req.Value); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save setting"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"key": key, "value": req.Value})
}
