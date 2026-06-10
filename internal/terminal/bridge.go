// Package terminal provides the PTY bridge that connects a Docker exec session
// to a WebSocket client. It is the core streaming engine of the ChallengeLabs platform.
package terminal

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/gorilla/websocket"

	"challengelabs/backend/internal/container"
	"challengelabs/backend/internal/models"
	"challengelabs/backend/internal/session"
	"challengelabs/backend/internal/ws"
	"challengelabs/backend/pkg/logger"
)

// Config carries all the runtime parameters needed by Bridge.Run.
// Keeping them in a struct makes the API forward-compatible — new fields can be
// added without changing the function signature.
type Config struct {
	// Session is a snapshot of the active session record at the time of connection.
	Session *models.Session

	// Client is the WebSocket send-side abstraction (buffered channel + write pump).
	Client *ws.Client

	// Conn is the raw WebSocket connection used for reading client messages.
	// Reads happen on the calling goroutine (the HTTP handler goroutine) so no
	// additional locking is required here.
	Conn *websocket.Conn

	// Hijacked is the bidirectional Docker exec stream.
	// Reader carries multiplexed stdout/stderr; Conn.Write sends to container stdin.
	Hijacked types.HijackedResponse

	// ExecID identifies the running exec session for PTY resize calls.
	ExecID string
}

// Bridge is the stateful PTY↔WebSocket bridge.
// It is intentionally decoupled from HTTP concerns (routing, auth, upgrade) so it
// can be instantiated once and reused across many sessions.
//
// Metrics (BytesIn / BytesOut) are updated atomically and safe to read
// concurrently from an external monitoring goroutine.
type Bridge struct {
	mgr   *container.Manager
	store session.Store

	bytesIn  int64 // total bytes received from browser → container stdin
	bytesOut int64 // total bytes sent from container stdout → browser
}

// New creates a Bridge. The bridge holds no per-session state and can be shared
// across concurrent sessions.
func New(mgr *container.Manager, store session.Store) *Bridge {
	return &Bridge{mgr: mgr, store: store}
}

// BytesIn returns the total bytes forwarded from the browser to the container stdin.
func (b *Bridge) BytesIn() int64 { return atomic.LoadInt64(&b.bytesIn) }

// BytesOut returns the total bytes forwarded from the container stdout to the browser.
func (b *Bridge) BytesOut() int64 { return atomic.LoadInt64(&b.bytesOut) }

// Run starts the bidirectional streaming bridge and blocks until the session ends.
//
// Termination triggers (any one closes the session):
//   - The Docker exec stream reaches EOF (container shell exited)
//   - The session TTL expires (checked every 5 seconds)
//   - The parent context is cancelled (server shutdown)
//   - The WebSocket connection closes (browser tab closed)
//
// The caller is responsible for calling cfg.Hijacked.Close() and cfg.Client.Close()
// after Run returns.
func (b *Bridge) Run(parent context.Context, cfg Config) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	// ── goroutine A: Container stdout → WebSocket ─────────────────────────
	// Reads raw PTY output in 4 KiB chunks and forwards each chunk to the
	// browser as a {"type":"output","data":"..."} JSON frame.
	// Also refreshes last_active_at so the idle-reaper doesn't kill a busy session.
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := cfg.Hijacked.Reader.Read(buf)
			if n > 0 {
				atomic.AddInt64(&b.bytesOut, int64(n))
				cfg.Client.Send(ws.ServerMessage{
					Type: ws.MsgTypeOutput,
					Data: string(buf[:n]),
				})
				_ = b.store.UpdateLastActive(cfg.Session.ID)
			}
			if err != nil {
				// Shell exited or container stopped — cancel the session context
				// so all other goroutines and the main read loop exit cleanly.
				cancel()
				return
			}
		}
	}()

	// ── goroutine B: Expiry ticker ────────────────────────────────────────
	// Pushes {"type":"expiry","remaining":N} every 5 seconds so the browser
	// can render a live countdown. Triggers status:"expired" at zero.
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				rem := cfg.Session.RemainingSeconds()
				cfg.Client.Send(ws.ServerMessage{
					Type:      ws.MsgTypeExpiry,
					Remaining: rem,
				})
				if rem == 0 {
					cfg.Client.Send(ws.ServerMessage{
						Type:   ws.MsgTypeStatus,
						Status: "expired",
					})
					cancel()
					return
				}
			case <-ctx.Done():
				return
			case <-cfg.Client.Done():
				return
			}
		}
	}()

	// ── Main loop: WebSocket → Container stdin ────────────────────────────
	// Reads frames from the browser on the caller's goroutine (no extra lock needed).
	// Three message types are handled:
	//   • "input"  → forward raw bytes to container stdin
	//   • "resize" → call Docker PTY resize API
	//   • "ping"   → application-level keepalive reply
	//
	// Raw (non-JSON) bytes are also accepted for xterm.js compatibility during
	// the initial handshake before the JSON protocol is established.
	//
	// The loop exits when ctx is done OR the connection closes, whichever comes first.
	cfg.Conn.SetReadDeadline(time.Time{}) // no deadline — interactive sessions are long-lived
	cfg.Conn.SetPongHandler(func(string) error {
		cfg.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		for {
			// Honour context cancellation between reads
			select {
			case <-ctx.Done():
				return
			default:
			}

			_, raw, err := cfg.Conn.ReadMessage()
			if err != nil {
				return
			}

			var msg ws.ClientMessage
			if jsonErr := json.Unmarshal(raw, &msg); jsonErr != nil {
				// Raw bytes fallback (xterm.js sends plain bytes before JSON setup)
				atomic.AddInt64(&b.bytesIn, int64(len(raw)))
				if _, writeErr := cfg.Hijacked.Conn.Write(raw); writeErr != nil {
					logger.Debug("PTY stdin write error (raw)", "err", writeErr)
					return
				}
				continue
			}

			switch msg.Type {

			case ws.MsgTypeInput:
				data := []byte(msg.Data)
				atomic.AddInt64(&b.bytesIn, int64(len(data)))
				if _, writeErr := cfg.Hijacked.Conn.Write(data); writeErr != nil {
					logger.Debug("PTY stdin write error", "err", writeErr)
					return
				}

			case ws.MsgTypeResize:
				if msg.Rows > 0 && msg.Cols > 0 {
					if resErr := b.mgr.ResizeExec(ctx, cfg.ExecID, msg.Rows, msg.Cols); resErr != nil {
						logger.Debug("PTY resize error", "err", resErr)
					}
				}

			case ws.MsgTypePing:
				cfg.Client.Send(ws.ServerMessage{Type: ws.MsgTypePong})

			default:
				logger.Debug("Unknown WS message type", "type", msg.Type)
			}
		}
	}()

	// Block until context is cancelled (any termination trigger above)
	<-ctx.Done()
	// Wait for the read goroutine to finish before returning so callers can
	// safely close cfg.Hijacked without a data race on the conn.
	<-readDone

	logger.Info("Terminal bridge closed",
		"session", cfg.Session.SessionKey[:8],
		"bytes_in", b.BytesIn(),
		"bytes_out", b.BytesOut(),
	)
}
