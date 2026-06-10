package ws

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"challengelabs/backend/pkg/logger"
)

// ── Message type constants ────────────────────────────────────────────────────

// Message types sent from client → server.
const (
	MsgTypeInput  = "input"  // terminal input data
	MsgTypeResize = "resize" // terminal resize {cols, rows}
	MsgTypePing   = "ping"
)

// Message types sent from server → client.
const (
	MsgTypeOutput = "output" // terminal output data
	MsgTypeStatus = "status" // session status update
	MsgTypeExpiry = "expiry" // remaining seconds
	MsgTypeError  = "error"
	MsgTypePong   = "pong"
)

// ── Message structs ───────────────────────────────────────────────────────────

// ClientMessage is decoded from an incoming WebSocket frame.
type ClientMessage struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
	Cols uint   `json:"cols,omitempty"`
	Rows uint   `json:"rows,omitempty"`
}

// ServerMessage is encoded and sent to the WebSocket client.
type ServerMessage struct {
	Type      string `json:"type"`
	Data      string `json:"data,omitempty"`
	Status    string `json:"status,omitempty"`
	Remaining int64  `json:"remaining,omitempty"`
	Error     string `json:"error,omitempty"`
}

// ── Hub ───────────────────────────────────────────────────────────────────────

// Hub tracks all active terminal WebSocket connections keyed by session key.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client
}

// NewHub creates and returns an empty Hub.
func NewHub() *Hub {
	return &Hub{clients: make(map[string]*Client)}
}

// Register adds a client under the given session key.
// If a client already exists for that key it is closed first.
func (h *Hub) Register(sessionKey string, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if existing, ok := h.clients[sessionKey]; ok {
		existing.Close()
	}
	h.clients[sessionKey] = c
	logger.Info("WS client registered", "session", short(sessionKey))
}

// Unregister removes the client associated with sessionKey from the hub.
func (h *Hub) Unregister(sessionKey string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, sessionKey)
	logger.Info("WS client unregistered", "session", short(sessionKey))
}

// Get returns the Client for the given session key, and whether it was found.
func (h *Hub) Get(sessionKey string) (*Client, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	c, ok := h.clients[sessionKey]
	return c, ok
}

// Broadcast sends msg to the client registered under sessionKey, if any.
func (h *Hub) Broadcast(sessionKey string, msg ServerMessage) {
	if c, ok := h.Get(sessionKey); ok {
		c.Send(msg)
	}
}

// BroadcastAll delivers msg to every currently connected client.
func (h *Hub) BroadcastAll(msg ServerMessage) {
	h.mu.RLock()
	keys := make([]string, 0, len(h.clients))
	for k := range h.clients {
		keys = append(keys, k)
	}
	h.mu.RUnlock()

	for _, k := range keys {
		h.Broadcast(k, msg)
	}
}

// Count returns the number of currently registered clients.
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// ── Client ────────────────────────────────────────────────────────────────────

// Client represents a single WebSocket terminal connection.
type Client struct {
	conn      *websocket.Conn
	send      chan ServerMessage
	done      chan struct{}
	closeOnce sync.Once
}

// NewClient wraps a WebSocket connection in a Client with a buffered send channel.
func NewClient(conn *websocket.Conn) *Client {
	return &Client{
		conn: conn,
		send: make(chan ServerMessage, 64),
		done: make(chan struct{}),
	}
}

// Send enqueues msg for delivery. Drops the message if the buffer is full or the client is closed.
func (c *Client) Send(msg ServerMessage) {
	select {
	case c.send <- msg:
	case <-c.done:
	default:
		logger.Warn("WS send buffer full, dropping message")
	}
}

// Close shuts down the client exactly once (safe to call concurrently).
func (c *Client) Close() {
	c.closeOnce.Do(func() {
		close(c.done)
		if c.conn != nil {
			c.conn.Close()
		}
	})
}

// Done returns a channel that is closed when the client is shut down.
func (c *Client) Done() <-chan struct{} { return c.done }

// WritePump drains the send channel and writes messages to the WebSocket.
// It also sends WebSocket-level pings every 30 seconds to keep the connection alive.
func (c *Client) WritePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteJSON(msg); err != nil {
				logger.Debug("WS write error", "err", err)
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}

		case <-c.done:
			return
		}
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

// short returns up to the first 8 characters of s for concise log output.
func short(s string) string {
	if len(s) <= 8 {
		return s
	}
	return s[:8]
}
