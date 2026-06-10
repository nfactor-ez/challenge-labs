package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"challengelabs/backend/config"
	"challengelabs/backend/internal/container"
	"challengelabs/backend/internal/models"
	"challengelabs/backend/internal/session"
	"challengelabs/backend/internal/terminal"
	"challengelabs/backend/internal/ws"
	"challengelabs/backend/pkg/logger"
)

// TerminalHandler upgrades HTTP connections to WebSocket and delegates all
// bidirectional streaming to the terminal.Bridge engine.
//
// HTTP concerns (auth, upgrade, session validation) are handled here.
// PTY streaming, expiry ticking, and stdin routing are handled by Bridge.Run.
type TerminalHandler struct {
	store        session.Store
	containerMgr *container.Manager
	hub          *ws.Hub
	bridge       *terminal.Bridge
	upgrader     websocket.Upgrader
}

// NewTerminalHandler constructs a TerminalHandler.
// store may be a MemoryStore (dev) or *repository.SessionRepository (prod) —
// the handler is agnostic to the implementation.
func NewTerminalHandler(
	store session.Store,
	containerMgr *container.Manager,
	hub *ws.Hub,
	cfg *config.Config,
) *TerminalHandler {
	allowedOrigins := make(map[string]bool)
	for _, o := range cfg.CORS.AllowedOrigins {
		allowedOrigins[o] = true
	}

	return &TerminalHandler{
		store:        store,
		containerMgr: containerMgr,
		hub:          hub,
		bridge:       terminal.New(containerMgr, store),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  cfg.WS.ReadBufferSize,
			WriteBufferSize: cfg.WS.WriteBufferSize,
			CheckOrigin: func(r *http.Request) bool {
				if cfg.Server.Env == "development" {
					return true // permissive in dev
				}
				return allowedOrigins[r.Header.Get("Origin")]
			},
		},
	}
}

// Connect is the WebSocket endpoint for an interactive container terminal.
//
// Flow:
//  1. Validate session ownership and liveness (auth already verified by middleware)
//  2. Upgrade HTTP → WebSocket
//  3. Open Docker exec PTY on the container
//  4. Register the client in the Hub (enables scheduler broadcasts)
//  5. Start write pump goroutine
//  6. Delegate to Bridge.Run (blocks until session ends)
//
// Route: GET /ws/terminal/:sessionKey?token=<jwt>          (authenticated)
//
//	GET /ws/dev/terminal/:sessionKey                   (dev mode, no JWT)
func (h *TerminalHandler) Connect(c *gin.Context) {
	sessionKey := c.Param("sessionKey")

	// ── 1. Session validation ────────────────────────────────────────────
	userID, _ := c.Get("userID")
	uid := userID.(uint)

	sess, err := h.store.FindByKey(sessionKey)
	if err != nil || sess == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}
	if sess.UserID != uid {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}
	if sess.Status != models.SessionStatusActive {
		c.JSON(http.StatusGone, gin.H{"error": "session is not active"})
		return
	}
	if sess.IsExpired() {
		_ = h.store.UpdateStatus(sess.ID, models.SessionStatusExpired)
		c.JSON(http.StatusGone, gin.H{"error": "session has expired"})
		return
	}

	// ── 2. WebSocket upgrade ─────────────────────────────────────────────
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("WS upgrade failed", "err", err)
		return
	}

	// ── 3. Attach to container PTY ───────────────────────────────────────
	ctx, cancelCtx := context.WithCancel(context.Background())
	defer cancelCtx()

	hr, execID, err := h.containerMgr.ExecAttach(ctx, sess.ContainerID)
	if err != nil {
		logger.Error("ExecAttach failed",
			"container", sess.ContainerID[:12],
			"err", err,
		)
		_ = conn.WriteJSON(ws.ServerMessage{
			Type:  ws.MsgTypeError,
			Error: "failed to attach to container shell",
		})
		conn.Close()
		return
	}
	defer hr.Close()

	// ── 4. Register client in Hub ────────────────────────────────────────
	client := ws.NewClient(conn)
	h.hub.Register(sessionKey, client)
	defer func() {
		h.hub.Unregister(sessionKey)
		client.Close()
	}()

	// ── 5. Start write pump ──────────────────────────────────────────────
	// The write pump drains the send channel and writes frames to the connection.
	// It runs in its own goroutine so Bridge.Run can push messages without blocking.
	go client.WritePump()

	// Send initial handshake so the browser knows the session is live
	client.Send(ws.ServerMessage{
		Type:      ws.MsgTypeStatus,
		Status:    string(sess.Status),
		Remaining: sess.RemainingSeconds(),
	})

	logger.Info("Terminal connected",
		"session", sessionKey[:8],
		"container", sess.ContainerID[:12],
		"user", uid,
	)

	// ── 6. Run the bridge (blocks until session ends) ────────────────────
	h.bridge.Run(ctx, terminal.Config{
		Session:  sess,
		Client:   client,
		Conn:     conn,
		Hijacked: hr,
		ExecID:   execID,
	})

	logger.Info("Terminal disconnected", "session", sessionKey[:8])
}
