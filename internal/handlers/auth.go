package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"challengelabs/backend/internal/auth"
	"challengelabs/backend/internal/middleware"
	"challengelabs/backend/internal/models"
	"challengelabs/backend/internal/otp"
	"challengelabs/backend/internal/repository"
	"challengelabs/backend/pkg/logger"
)

// AuthHandler handles user registration, login, and profile operations.
type AuthHandler struct {
	userRepo *repository.UserRepository
	jwtSvc   *auth.JWTService
	otpSvc   *otp.Service
}

func NewAuthHandler(userRepo *repository.UserRepository, jwtSvc *auth.JWTService, otpSvc *otp.Service) *AuthHandler {
	return &AuthHandler{userRepo: userRepo, jwtSvc: jwtSvc, otpSvc: otpSvc}
}

// ─── Register (Step 1: Request OTP) ──────────────────────────────────────────

type registerRequestBody struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required,min=8,max=128"`
}

// RegisterRequest validates inputs, then sends an OTP to the email.
// POST /api/v1/auth/register/request
func (h *AuthHandler) RegisterRequest(c *gin.Context) {
	var req registerRequestBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	if existing, _ := h.userRepo.FindByEmail(req.Email); existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
		return
	}
	if existing, _ := h.userRepo.FindByUsername(req.Username); existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
		return
	}

	if h.otpSvc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "email service not configured"})
		return
	}
	if err := h.otpSvc.GenerateAndSend(req.Email, "registration"); err != nil {
		logger.Error("OTP send failed (registration)", "email", req.Email, "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send verification email — please try again"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Verification code sent to your email."})
}

// ─── Register (Step 2: Verify OTP & Create Account) ──────────────────────────

type registerVerifyBody struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required,min=8,max=128"`
	OTP      string `json:"otp"      binding:"required,len=6"`
}

// RegisterVerify verifies the OTP, creates the user, and returns a JWT.
// POST /api/v1/auth/register/verify
func (h *AuthHandler) RegisterVerify(c *gin.Context) {
	var req registerVerifyBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	// Verify OTP
	ok, err := h.otpSvc.Verify(req.Email, req.OTP, "registration")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "verification error"})
		return
	}
	if !ok {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "Invalid or expired verification code."})
		return
	}

	// Re-check uniqueness (race condition guard)
	if existing, _ := h.userRepo.FindByEmail(req.Email); existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
		return
	}
	if existing, _ := h.userRepo.FindByUsername(req.Username); existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	user := &models.User{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: string(hash),
		Role:         "user",
	}
	if err = h.userRepo.Create(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	token, err := h.jwtSvc.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token": token,
		"user":  userResponse(user),
	})
}

// ─── Login ────────────────────────────────────────────────────────────────────

type loginRequest struct {
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Login validates credentials.
// If MFA is enabled it returns a short-lived temp token instead of a full JWT.
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userRepo.FindByEmail(strings.ToLower(strings.TrimSpace(req.Email)))
	if err != nil || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	// MFA enabled — issue a short-lived "mfa" temp token instead of a full JWT
	if user.MFAEnabled {
		tempToken, err := h.jwtSvc.GenerateTempMFAToken(user.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"mfa_required": true,
			"temp_token":   tempToken,
		})
		return
	}

	token, err := h.jwtSvc.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  userResponse(user),
	})
}

// ─── MFA Login Verify ─────────────────────────────────────────────────────────

type mfaLoginVerifyRequest struct {
	TempToken string `json:"temp_token" binding:"required"`
	Code      string `json:"code"       binding:"required,len=6"`
}

// MFALoginVerify validates the TOTP code during the second login step.
// POST /api/v1/auth/mfa/login-verify
func (h *AuthHandler) MFALoginVerify(c *gin.Context) {
	var req mfaLoginVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := h.jwtSvc.ValidateTempMFAToken(req.TempToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired session"})
		return
	}

	user, _ := h.userRepo.FindByID(userID)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	if !otp.VerifyTOTP(user.MFATOTPSecret, req.Code) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authenticator code"})
		return
	}

	token, err := h.jwtSvc.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  userResponse(user),
	})
}

// ─── Me ───────────────────────────────────────────────────────────────────────

// Me returns the profile of the currently authenticated user.
func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := h.userRepo.FindByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": userResponse(user)})
}

// ─── ChangePassword ────────────────────────────────────────────────────────────

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password"     binding:"required,min=8,max=128"`
}

// ChangePassword updates the authenticated user's password.
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, _ := h.userRepo.FindByID(userID)
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "current password is incorrect"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}
	if err = h.userRepo.UpdatePassword(userID, string(hash)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password updated"})
}

// ─── UpdateProfile ─────────────────────────────────────────────────────────────

type updateProfileRequest struct {
	Username  string `json:"username"   binding:"omitempty,min=3,max=50"`
	AvatarURL string `json:"avatar_url" binding:"omitempty,url"`
}

// UpdateProfile updates the authenticated user's display name and/or avatar URL.
// PATCH /api/v1/auth/me
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, _ := h.userRepo.FindByID(userID)
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if req.Username != "" && req.Username != user.Username {
		// Ensure username is not already taken by another account
		if existing, _ := h.userRepo.FindByUsername(strings.TrimSpace(req.Username)); existing != nil && existing.ID != userID {
			c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
			return
		}
		user.Username = strings.TrimSpace(req.Username)
	}
	if req.AvatarURL != "" {
		user.AvatarURL = req.AvatarURL
	}

	if err := h.userRepo.Update(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": userResponse(user)})
}

// ─── ForgotPassword (Step 1: Request OTP) ────────────────────────────────────

type forgotPasswordRequestBody struct {
	Email string `json:"email" binding:"required,email"`
}

// ForgotPasswordRequest sends an OTP to the given email for password reset.
// POST /api/v1/auth/forgot-password/request
func (h *AuthHandler) ForgotPasswordRequest(c *gin.Context) {
	var req forgotPasswordRequestBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	// Check that the email is actually registered
	user, _ := h.userRepo.FindByEmail(email)
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No account found with that email address."})
		return
	}

	if h.otpSvc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "email service not configured"})
		return
	}
	if err := h.otpSvc.GenerateAndSend(email, "forgot_password"); err != nil {
		logger.Error("OTP send failed (forgot_password)", "email", email, "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to send verification email — please try again"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Verification code sent to your email."})
}

// ─── ForgotPassword (Step 2: Verify OTP & Reset Password) ────────────────────

type forgotPasswordVerifyBody struct {
	Email       string `json:"email"        binding:"required,email"`
	OTP         string `json:"otp"          binding:"required,len=6"`
	NewPassword string `json:"new_password" binding:"required,min=8,max=128"`
}

// ForgotPasswordVerify verifies OTP and sets a new password.
// POST /api/v1/auth/forgot-password/verify
func (h *AuthHandler) ForgotPasswordVerify(c *gin.Context) {
	var req forgotPasswordVerifyBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	ok, err := h.otpSvc.Verify(email, req.OTP, "forgot_password")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "verification error"})
		return
	}
	if !ok {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "Invalid or expired verification code."})
		return
	}

	user, _ := h.userRepo.FindByEmail(email)
	if user == nil {
		// Generic message to avoid leaking account existence
		c.JSON(http.StatusOK, gin.H{"message": "Password reset successful."})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}
	if err = h.userRepo.UpdatePassword(user.ID, string(hash)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password reset successful. You can now log in with your new password."})
}

// ─── Helper ───────────────────────────────────────────────────────────────────

func userResponse(u *models.User) gin.H {
	return gin.H{
		"id":                  u.ID,
		"username":            u.Username,
		"email":               u.Email,
		"role":                u.Role,
		"avatar_url":          u.AvatarURL,
		"created_at":          u.CreatedAt,
		"mfa_enabled":         u.MFAEnabled,
		"is_premium":          u.IsPremium,
		"premium_granted_at":  u.PremiumGrantedAt,
		"premium_expires_at":  u.PremiumExpiresAt,
	}
}
