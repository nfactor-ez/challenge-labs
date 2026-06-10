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
	authH      := NewAuthHandler(userRepo, jwtSvc)
	challengeH := NewChallengeHandler(challengeRepo, progressRepo)
	categoryH  := NewCategoryHandler(categoryRepo)
	sessionH   := NewSessionHandler(store, challengeRepo, containerMgr, cfg)
	terminalH  := NewTerminalHandler(store, containerMgr, hub, cfg)
	adminH     := NewAdminHandler(userRepo, challengeRepo, store)

	// ── Rate limiters ─────────────────────────────────────────────────────
	authLimiter := middleware.RateLimit(10, time.Minute)
	apiLimiter  := middleware.RateLimit(120, time.Minute)

	// ── Public auth ───────────────────────────────────────────────────────
	authGroup := r.Group("/api/v1/auth")
	authGroup.Use(authLimiter)
	{
		authGroup.POST("/register", authH.Register)
		authGroup.POST("/login", authH.Login)
	}

	// ── Authenticated REST API ────────────────────────────────────────────
	api := r.Group("/api/v1")
	api.Use(apiLimiter, middleware.AuthRequired(jwtSvc))
	{
		api.GET("/auth/me", authH.Me)
		api.PUT("/auth/password", authH.ChangePassword)
		api.PATCH("/auth/me", authH.UpdateProfile)

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
			admin.POST("/challenges", challengeH.Create)
			admin.PUT("/challenges/:id", challengeH.Update)
			admin.DELETE("/challenges/:id", challengeH.Delete)
			admin.POST("/categories", categoryH.Create)
			admin.PUT("/categories/:id", categoryH.Update)
			admin.DELETE("/categories/:id", categoryH.Delete)
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
