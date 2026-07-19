package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"challengelabs/backend/internal/repository"
	"challengelabs/backend/internal/session"
)

// AdminHandler exposes platform administration endpoints.
type AdminHandler struct {
	userRepo      *repository.UserRepository
	challengeRepo *repository.ChallengeRepository
	store         session.Store
}

func NewAdminHandler(
	userRepo *repository.UserRepository,
	challengeRepo *repository.ChallengeRepository,
	store session.Store,
) *AdminHandler {
	return &AdminHandler{userRepo: userRepo, challengeRepo: challengeRepo, store: store}
}

// ─── Stats ────────────────────────────────────────────────────────────────────

// Stats returns platform-wide statistics: active sessions, user count, challenge count.
// GET /api/v1/admin/stats
func (h *AdminHandler) Stats(c *gin.Context) {
	active, err := h.store.CountActiveSessions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "store error"})
		return
	}
	userCount, _ := h.userRepo.CountAll()
	challengeCount, _ := h.challengeRepo.CountAll()

	c.JSON(http.StatusOK, gin.H{
		"active_sessions":  active,
		"total_users":      userCount,
		"total_challenges": challengeCount,
	})
}

// ─── ListUsers ────────────────────────────────────────────────────────────────

// ListUsers returns a paginated list of all users (admin only).
// GET /api/v1/admin/users?page=1&page_size=20
func (h *AdminHandler) ListUsers(c *gin.Context) {
	page := 1
	pageSize := 20
	if p, err := strconv.Atoi(c.DefaultQuery("page", "1")); err == nil && p > 0 {
		page = p
	}
	if ps, err := strconv.Atoi(c.DefaultQuery("page_size", "20")); err == nil && ps > 0 && ps <= 100 {
		pageSize = ps
	}

	users, total, err := h.userRepo.ListAll(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch users"})
		return
	}

	// Strip password hashes from the response
	type userEntry struct {
		ID         uint   `json:"id"`
		Username   string `json:"username"`
		Email      string `json:"email"`
		Role       string `json:"role"`
		AvatarURL  string `json:"avatar_url"`
		MFAEnabled bool   `json:"mfa_enabled"`
		CreatedAt  string `json:"created_at"`
	}
	entries := make([]userEntry, len(users))
	for i, u := range users {
		entries[i] = userEntry{
			ID:         u.ID,
			Username:   u.Username,
			Email:      u.Email,
			Role:       u.Role,
			AvatarURL:  u.AvatarURL,
			MFAEnabled: u.MFAEnabled,
			CreatedAt:  u.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"users":     entries,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// ─── GetUser ──────────────────────────────────────────────────────────────────

// GetUser returns a user by ID.
// GET /api/v1/admin/users/:id
func (h *AdminHandler) GetUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	user, _ := h.userRepo.FindByID(uint(id))
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": userResponse(user)})
}

// ─── SetRole ──────────────────────────────────────────────────────────────────

// SetRole changes a user's role to "user" or "admin".
// PATCH /api/v1/admin/users/:id/role
func (h *AdminHandler) SetRole(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		Role string `json:"role" binding:"required,oneof=user admin"`
	}
	if err = c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.userRepo.FindByID(uint(id))
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	user.Role = body.Role
	if err = h.userRepo.Update(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": userResponse(user)})
}

// ─── SetUserPassword ──────────────────────────────────────────────────────────

// SetUserPassword allows an admin to reset any user's password without knowing the current one.
// PATCH /api/v1/admin/users/:id/password
func (h *AdminHandler) SetUserPassword(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		NewPassword string `json:"new_password" binding:"required,min=8,max=128"`
	}
	if err = c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.userRepo.FindByID(uint(id))
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}
	if err = h.userRepo.UpdatePassword(uint(id), string(hash)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password updated successfully"})
}
