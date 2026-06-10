package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"challengelabs/backend/config"
	"challengelabs/backend/internal/auth"
	"challengelabs/backend/internal/container"
	"challengelabs/backend/internal/handlers"
	"challengelabs/backend/internal/repository"
	"challengelabs/backend/internal/scheduler"
	"challengelabs/backend/internal/session"
	"challengelabs/backend/internal/ws"
	"challengelabs/backend/pkg/logger"
)

func main() {
	// ── 1. Load configuration ──────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		panic("config error: " + err.Error())
	}

	// ── 2. Initialise structured logger ───────────────────────────────────
	logger.Init(cfg.Server.Env)

	// ── 3. Session store ───────────────────────────────────────────────────
	// The store is the only component that differs between dev and prod.
	// All downstream code (handlers, scheduler, terminal bridge) is agnostic
	// to which implementation is in use.
	var store session.Store
	var userRepo      *repository.UserRepository
	var challengeRepo *repository.ChallengeRepository
	var progressRepo  *repository.ProgressRepository
	var categoryRepo  *repository.CategoryRepository

	switch cfg.Store {

	case "memory":
		logger.Info("Session store: in-memory (no PostgreSQL required)")
		store = session.NewMemoryStore()
		// Non-session repositories are nil; auth/challenge/admin routes will
		// be disabled. Only the terminal engine (session + WS) runs.
		// To enable full-stack features set STORE=postgres.

	default: // "postgres"
		db, dbErr := repository.InitDB(cfg.DB.DSN(), cfg.Server.Env == "development")
		if dbErr != nil {
			logger.Error("Database connection failed", "err", dbErr)
			logger.Info("Tip: set STORE=memory to run without PostgreSQL")
			os.Exit(1)
		}
		sqlDB, _ := db.DB()
		defer sqlDB.Close()

		userRepo      = repository.NewUserRepository(db)
		challengeRepo = repository.NewChallengeRepository(db)
		categoryRepo  = repository.NewCategoryRepository(db)
		sessionRepo   := repository.NewSessionRepository(db)
		progressRepo  = repository.NewProgressRepository(db)
		store         = sessionRepo // *SessionRepository satisfies session.Store
		logger.Info("Session store: PostgreSQL")
	}

	// ── 4. Shared services ─────────────────────────────────────────────────
	jwtSvc, err := newJWTService(cfg)
	if err != nil {
		logger.Error("JWT service init failed", "err", err)
		os.Exit(1)
	}

	containerMgr, err := container.NewManager(&cfg.Docker)
	if err != nil {
		logger.Error("Docker manager init failed", "err", err)
		os.Exit(1)
	}

	hub := ws.NewHub()

	// ── 5. Background scheduler ────────────────────────────────────────────
	sched := scheduler.New(store, containerMgr, hub, cfg)
	sched.Start()
	defer sched.Stop()

	// ── 6. HTTP router ─────────────────────────────────────────────────────
	router := handlers.NewRouter(
		cfg,
		jwtSvc,
		userRepo,
		challengeRepo,
		categoryRepo,
		store,
		progressRepo,
		containerMgr,
		hub,
	)

	// ── 7. HTTP server with graceful shutdown ──────────────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0,           // 0 = no timeout for long-lived WS connections
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("Server started",
			"port", cfg.Server.Port,
			"env", cfg.Server.Env,
			"store", cfg.Store,
		)
		if cfg.Server.Env == "development" {
			logger.Info("Terminal UI available", "url", "http://localhost:"+cfg.Server.Port+"/terminal")
		}
		if err = srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("Server error", "err", err)
			os.Exit(1)
		}
	}()

	// ── 8. Wait for shutdown signal ────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutdown initiated…")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err = srv.Shutdown(ctx); err != nil {
		logger.Error("Forced shutdown", "err", err)
	}
	logger.Info("Server stopped")
}

func newJWTService(cfg *config.Config) (*auth.JWTService, error) {
	if cfg.JWT.Secret == "" {
		return nil, errors.New("JWT_SECRET must be set")
	}
	return auth.NewJWTService(cfg.JWT.Secret, cfg.JWT.ExpiryHours), nil
}
