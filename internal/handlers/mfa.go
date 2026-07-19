package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"challengelabs/backend/internal/middleware"
	otpsvc "challengelabs/backend/internal/otp"
	"challengelabs/backend/internal/repository"
)

// MFAHandler manages TOTP multi-factor authentication setup and teardown.
type MFAHandler struct {
	userRepo *repository.UserRepository
}

func NewMFAHandler(userRepo *repository.UserRepository) *MFAHandler {
	return &MFAHandler{userRepo: userRepo}
}

const mfaIssuer = "ChallengeLabs"

// ─── Setup ────────────────────────────────────────────────────────────────────

// MFASetup generates a new TOTP secret and QR code URL for the authenticated user.
// The secret is NOT yet stored; the user must confirm with a valid code first.
// POST /api/v1/auth/mfa/setup
func (h *MFAHandler) Setup(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, _ := h.userRepo.FindByID(userID)
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	secret, otpauthURL, err := otpsvc.GenerateTOTPSecret(mfaIssuer, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate MFA secret"})
		return
	}

	// Store the pending secret on the user so Enable can retrieve it.
	// MFAEnabled remains false until the user confirms.
	if err = h.userRepo.UpdateMFA(userID, false, secret); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save MFA secret"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"secret":       secret,
		"otpauth_url":  otpauthURL,
		"mfa_enabled":  false,
	})
}

// ─── Enable ───────────────────────────────────────────────────────────────────

type mfaEnableRequest struct {
	Code string `json:"code" binding:"required,len=6"`
}

// MFAEnable confirms the user has scanned the QR code and enables MFA.
// POST /api/v1/auth/mfa/enable
func (h *MFAHandler) Enable(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req mfaEnableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, _ := h.userRepo.FindByID(userID)
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if user.MFATOTPSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "call /mfa/setup first"})
		return
	}

	if !otpsvc.VerifyTOTP(user.MFATOTPSecret, req.Code) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "invalid authenticator code"})
		return
	}

	if err := h.userRepo.UpdateMFA(userID, true, user.MFATOTPSecret); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enable MFA"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "MFA enabled successfully", "mfa_enabled": true})
}

// ─── Disable ──────────────────────────────────────────────────────────────────

type mfaDisableRequest struct {
	Code string `json:"code" binding:"required,len=6"`
}

// MFADisable disables MFA after verifying the current TOTP code.
// POST /api/v1/auth/mfa/disable
func (h *MFAHandler) Disable(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req mfaDisableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, _ := h.userRepo.FindByID(userID)
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if !user.MFAEnabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "MFA is not enabled"})
		return
	}

	if !otpsvc.VerifyTOTP(user.MFATOTPSecret, req.Code) {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "invalid authenticator code"})
		return
	}

	if err := h.userRepo.UpdateMFA(userID, false, ""); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to disable MFA"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "MFA disabled successfully", "mfa_enabled": false})
}
