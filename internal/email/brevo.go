package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"challengelabs/backend/config"
	"challengelabs/backend/pkg/logger"
)

const brevoAPIURL = "https://api.brevo.com/v3/smtp/email"

// Mailer sends transactional emails via Brevo's REST API.
// The REST API uses an API key (xkeysib-...) set via BREVO_API_KEY env var.
// Unlike SMTP, the REST API has NO IP restrictions — works from any Docker/cloud IP.
type Mailer struct {
	cfg    config.SMTPConfig
	client *http.Client
}

// NewMailer creates a new Mailer from config.
func NewMailer(cfg config.SMTPConfig) *Mailer {
	return &Mailer{
		cfg: cfg,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// apiKey returns the Brevo REST API key.
// Prefers BREVO_API_KEY (xkeysib-...), falls back to SMTP_PASSWORD for compatibility.
func (m *Mailer) apiKey() string {
	if m.cfg.APIKey != "" {
		return m.cfg.APIKey
	}
	return m.cfg.Password
}

// IsConfigured returns true if any API key is available.
func (m *Mailer) IsConfigured() bool {
	return m.apiKey() != ""
}

// SendOTP sends a 6-digit OTP to the given email address.
func (m *Mailer) SendOTP(to, purpose, code string) error {
	if !m.IsConfigured() {
		logger.Error("Brevo API key not set — set BREVO_API_KEY in docker-compose.yml")
		return fmt.Errorf("Brevo API key not configured (BREVO_API_KEY)")
	}
	subject := "ChallengeLabs — Your verification code"
	body := buildOTPBody(purpose, code)
	err := m.send(to, subject, body)
	if err != nil {
		logger.Error("Brevo API send failed", "to", to, "purpose", purpose, "err", err)
	} else {
		logger.Info("OTP email sent via Brevo API", "to", to, "purpose", purpose)
	}
	return err
}

// brevoEmailPayload is the JSON body for POST /v3/smtp/email.
type brevoEmailPayload struct {
	Sender      brevoContact   `json:"sender"`
	To          []brevoContact `json:"to"`
	Subject     string         `json:"subject"`
	TextContent string         `json:"textContent"`
}

type brevoContact struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email"`
}

// send posts the email via Brevo REST API.
// Requires the api-key header to be set to a REST API key (xkeysib-...).
// Get one at: https://app.brevo.com/settings/keys/api
func (m *Mailer) send(to, subject, body string) error {
	payload := brevoEmailPayload{
		Sender:      brevoContact{Name: "ChallengeLabs", Email: m.cfg.From},
		To:          []brevoContact{{Email: to}},
		Subject:     subject,
		TextContent: body,
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("brevo: marshal payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, brevoAPIURL, bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("brevo: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("api-key", m.apiKey())

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("brevo: http request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("brevo: API error %d: %s", resp.StatusCode, string(respBody))
	}

	logger.Info("Brevo API response", "status", resp.StatusCode)
	return nil
}

func buildOTPBody(purpose, code string) string {
	var action string
	switch purpose {
	case "registration":
		action = "complete your registration"
	case "forgot_password":
		action = "reset your password"
	default:
		action = "verify your identity"
	}
	return fmt.Sprintf(
		"Hello,\n\nYour ChallengeLabs verification code to %s is:\n\n  %s\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\nIf you didn't request this, you can safely ignore this email.\n\n— ChallengeLabs Team\n",
		action, code,
	)
}
