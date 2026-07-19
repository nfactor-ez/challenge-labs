package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"challengelabs/backend/internal/middleware"
	"challengelabs/backend/internal/repository"
)

// PremiumHandler manages premium subscription state.
type PremiumHandler struct {
	userRepo *repository.UserRepository
}

func NewPremiumHandler(userRepo *repository.UserRepository) *PremiumHandler {
	return &PremiumHandler{userRepo: userRepo}
}

// ─── Status ───────────────────────────────────────────────────────────────────

// Status returns the authenticated user's premium status.
// GET /api/v1/premium/status
func (h *PremiumHandler) Status(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, _ := h.userRepo.FindByID(userID)
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// Check if subscription has expired
	active := user.IsPremium
	if active && user.PremiumExpiresAt != nil && time.Now().After(*user.PremiumExpiresAt) {
		active = false
		// Auto-revoke expired subscription
		_ = h.userRepo.UpdatePremium(userID, false, nil, nil)
	}

	c.JSON(http.StatusOK, gin.H{
		"is_premium":          active,
		"premium_granted_at":  user.PremiumGrantedAt,
		"premium_expires_at":  user.PremiumExpiresAt,
	})
}

// ─── Request (placeholder) ────────────────────────────────────────────────────

// Request is a placeholder endpoint for initiating a premium upgrade.
// The actual payment gateway (Stripe, Razorpay, etc.) will be wired here later.
// POST /api/v1/premium/request
func (h *PremiumHandler) Request(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "pending",
		"message": "Premium upgrade requests will be processed once payment is configured. Contact an admin to get manual access.",
	})
}

// ─── AdminSet ─────────────────────────────────────────────────────────────────

type adminSetPremiumRequest struct {
	IsPremium bool   `json:"is_premium"`
	// Optional: "2025-12-31T23:59:59Z" — nil means unlimited
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
}

// AdminSet grants or revokes premium for any user.
// PATCH /api/v1/admin/users/:id/premium
func (h *PremiumHandler) AdminSet(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	var req adminSetPremiumRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, _ := h.userRepo.FindByID(uint(id))
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var grantedAt *time.Time
	if req.IsPremium {
		now := time.Now()
		grantedAt = &now
	}

	if err = h.userRepo.UpdatePremium(uint(id), req.IsPremium, grantedAt, req.ExpiresAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update premium status"})
		return
	}

	action := "revoked"
	if req.IsPremium {
		action = "granted"
	}
	c.JSON(http.StatusOK, gin.H{
		"message":    "Premium " + action + " for " + user.Username,
		"is_premium": req.IsPremium,
		"expires_at": req.ExpiresAt,
	})
}
