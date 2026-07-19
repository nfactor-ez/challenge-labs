package handlers

import (
	"embed"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"challengelabs/backend/config"
	"challengelabs/backend/internal/auth"
	"challengelabs/backend/internal/container"
	"challengelabs/backend/internal/middleware"
	"challengelabs/backend/internal/otp"
	"challengelabs/backend/internal/repository"
	"challengelabs/backend/internal/session"
	"challengelabs/backend/internal/ws"
)

//go:embed static/terminal.html
var staticFiles embed.FS

// NewRouter builds and returns the fully configured Gin engine.
// store may be a MemoryStore (dev/test) or *repository.SessionRepository (prod).
func NewRouter(
	cfg *config.Config,
	jwtSvc *auth.JWTService,
	userRepo *repository.UserRepository,
	challengeRepo *repository.ChallengeRepository,
	categoryRepo *repository.CategoryRepository,
	store session.Store,
	progressRepo *repository.ProgressRepository,
	containerMgr *container.Manager,
	hub *ws.Hub,
	otpSvc *otp.Service,
	settingsRepo *repository.SettingsRepository,
) *gin.Engine {
	if cfg.Server.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	// ── CORS ─────────────────────────────────────────────────────────────
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORS.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// ── Health check ──────────────────────────────────────────────────────
	r.GET("/health", func(c *gin.Context) {
		activeSessions, _ := store.CountActiveSessions()
		c.JSON(http.StatusOK, gin.H{
			"status":          "ok",
			"service":         "challengelabs",
			"env":             cfg.Server.Env,
			"active_sessions": activeSessions,
		})
	})

	// ── Handlers ─────────────────────────────────────────────────────
	authH      := NewAuthHandler(userRepo, jwtSvc, otpSvc)
	challengeH := NewChallengeHandler(challengeRepo, progressRepo, userRepo)
	categoryH  := NewCategoryHandler(categoryRepo)
	sessionH   := NewSessionHandler(store, challengeRepo, containerMgr, cfg)
	terminalH  := NewTerminalHandler(store, containerMgr, hub, cfg)
	adminH     := NewAdminHandler(userRepo, challengeRepo, store)
	mfaH       := NewMFAHandler(userRepo)
	premiumH   := NewPremiumHandler(userRepo)
	settingsH  := NewSettingsHandler(settingsRepo)

	// ── Rate limiters ─────────────────────────────────────────────────────
	authLimiter := middleware.RateLimit(10, time.Minute)
	apiLimiter  := middleware.RateLimit(120, time.Minute)

	// ── Public settings (feature flags — no auth required) ───────────────
	if settingsRepo != nil {
		r.GET("/api/v1/settings", settingsH.PublicSettings)
	} else {
		// Fallback: all features enabled when DB not available
		r.GET("/api/v1/settings", func(c *gin.Context) {
			c.JSON(200, gin.H{"leaderboard_enabled": true})
		})
	}

	// ── Public auth ───────────────────────────────────────────────────────
	authGroup := r.Group("/api/v1/auth")
	authGroup.Use(authLimiter)
	{
		// Registration (2-step)
		authGroup.POST("/register/request", authH.RegisterRequest)
		authGroup.POST("/register/verify", authH.RegisterVerify)

		// Login
		authGroup.POST("/login", authH.Login)

		// MFA second-step login (public — uses temp token)
		authGroup.POST("/mfa/login-verify", authH.MFALoginVerify)

		// Forgot password (2-step)
		authGroup.POST("/forgot-password/request", authH.ForgotPasswordRequest)
		authGroup.POST("/forgot-password/verify", authH.ForgotPasswordVerify)
	}

	// ── Authenticated REST API ────────────────────────────────────────────
	api := r.Group("/api/v1")
	api.Use(apiLimiter, middleware.AuthRequired(jwtSvc))
	{
		api.GET("/auth/me", authH.Me)
		api.PUT("/auth/password", authH.ChangePassword)
		api.PATCH("/auth/me", authH.UpdateProfile)

		// MFA management (requires full JWT)
		api.POST("/auth/mfa/setup", mfaH.Setup)
		api.POST("/auth/mfa/enable", mfaH.Enable)
		api.POST("/auth/mfa/disable", mfaH.Disable)

		// Premium subscription
		api.GET("/premium/status", premiumH.Status)
		api.POST("/premium/request", premiumH.Request) // placeholder — payment gateway hooks later
		api.GET("/categories", categoryH.List)

		api.GET("/challenges", challengeH.List)
		api.GET("/challenges/:id", challengeH.Get)
		api.POST("/challenges/:id/submit", challengeH.SubmitFlag)

		api.GET("/leaderboard", challengeH.Leaderboard)

		api.POST("/sessions/challenges/:challengeID/start", sessionH.Start)
		api.DELETE("/sessions/:sessionKey", sessionH.Terminate)
		api.GET("/sessions/:sessionKey/status", sessionH.Status)
		api.GET("/sessions/:sessionKey/stats", sessionH.Stats)
		api.GET("/sessions", sessionH.ListActive)
		api.GET("/sessions/challenges/:challengeID/reconnect", sessionH.Reconnect)

		// Admin
		admin := api.Group("/admin")
		admin.Use(middleware.AdminRequired())
		{
			admin.GET("/stats", adminH.Stats)
			admin.GET("/users", adminH.ListUsers)
			admin.GET("/users/:id", adminH.GetUser)
			admin.PATCH("/users/:id/role", adminH.SetRole)
			admin.PATCH("/users/:id/password", adminH.SetUserPassword)
			admin.PATCH("/users/:id/premium", premiumH.AdminSet) // grant/revoke premium
			admin.POST("/challenges", challengeH.Create)
			admin.PUT("/challenges/:id", challengeH.Update)
			admin.DELETE("/challenges/:id", challengeH.Delete)
			admin.POST("/categories", categoryH.Create)
			admin.PUT("/categories/:id", categoryH.Update)
			admin.DELETE("/categories/:id", categoryH.Delete)
			if settingsRepo != nil {
				admin.GET("/settings", settingsH.List)
				admin.PATCH("/settings/:key", settingsH.Update)
			}
		}
	}

	// ── Authenticated WebSocket terminal ──────────────────────────────────
	// JWT is passed as ?token=<jwt> because browsers cannot set custom headers
	// on WebSocket upgrade requests.
	wsGroup := r.Group("/ws")
	wsGroup.Use(middleware.AuthRequired(jwtSvc))
	{
		wsGroup.GET("/terminal/:sessionKey", terminalH.Connect)
	}

	// ── Development-only routes ───────────────────────────────────────────
	// Registered when ENV=development. Bypass JWT; use DevAuth (synthetic userID=1).
	// These routes are also useful as integration smoke tests in CI.
	if cfg.Server.Env == "development" {
		devH := NewDevHandler(store, containerMgr, hub)

		// Serve the xterm.js terminal UI (embedded in the binary)
		r.GET("/terminal", func(c *gin.Context) {
			data, err := staticFiles.ReadFile("static/terminal.html")
			if err != nil {
				c.String(http.StatusInternalServerError, "terminal UI not found")
				return
			}
			c.Data(http.StatusOK, "text/html; charset=utf-8", data)
		})

		dev := r.Group("/dev")
		dev.Use(DevAuth())
		{
			dev.POST("/sessions/start", devH.Start)
			dev.DELETE("/sessions/:sessionKey", devH.Terminate)
		}

		wsDev := r.Group("/ws/dev")
		wsDev.Use(DevAuth())
		{
			wsDev.GET("/terminal/:sessionKey", terminalH.Connect)
		}
	}

	return r
}
