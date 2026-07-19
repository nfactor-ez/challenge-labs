package otp

import (
	"crypto/rand"
	"fmt"
	"time"

	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"

	"challengelabs/backend/internal/email"
	"challengelabs/backend/internal/models"
	"challengelabs/backend/internal/repository"
)

const (
	otpExpiryMinutes = 10
	otpLength        = 6
)

// Service manages email OTP codes and TOTP MFA operations.
type Service struct {
	otpRepo *repository.OTPRepository
	mailer  *email.Mailer
}

// NewService creates a new OTP service.
func NewService(otpRepo *repository.OTPRepository, mailer *email.Mailer) *Service {
	return &Service{otpRepo: otpRepo, mailer: mailer}
}

// ─── Email OTP ────────────────────────────────────────────────────────────────

// GenerateAndSend creates a 6-digit OTP, stores its hash, and emails it to the user.
func (s *Service) GenerateAndSend(email_, purpose string) error {
	// Invalidate any previous OTPs for this email+purpose
	if err := s.otpRepo.InvalidatePrevious(email_, purpose); err != nil {
		return fmt.Errorf("otp: invalidate previous: %w", err)
	}

	// Generate a cryptographically random 6-digit code
	code, err := generateCode()
	if err != nil {
		return fmt.Errorf("otp: generate code: %w", err)
	}

	// Hash it for safe storage
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("otp: hash code: %w", err)
	}

	record := &models.OTPCode{
		Email:     email_,
		CodeHash:  string(hash),
		Purpose:   purpose,
		ExpiresAt: time.Now().Add(otpExpiryMinutes * time.Minute),
	}
	if err = s.otpRepo.Create(record); err != nil {
		return fmt.Errorf("otp: store code: %w", err)
	}

	// Send the email
	if err = s.mailer.SendOTP(email_, purpose, code); err != nil {
		return fmt.Errorf("otp: send email: %w", err)
	}

	return nil
}

// Verify checks the supplied code against the stored hash and marks it as used.
// Returns (true, nil) on success, (false, nil) on wrong/expired code.
func (s *Service) Verify(email_, code, purpose string) (bool, error) {
	record, err := s.otpRepo.FindValid(email_, purpose)
	if err != nil {
		return false, fmt.Errorf("otp: find valid: %w", err)
	}
	if record == nil {
		return false, nil // no valid OTP found
	}

	if bcrypt.CompareHashAndPassword([]byte(record.CodeHash), []byte(code)) != nil {
		return false, nil // wrong code
	}

	// Mark as used to prevent replay
	if err = s.otpRepo.MarkUsed(record.ID); err != nil {
		return false, fmt.Errorf("otp: mark used: %w", err)
	}
	return true, nil
}

// ─── TOTP MFA ─────────────────────────────────────────────────────────────────

// GenerateTOTPSecret creates a new TOTP secret for a user and returns the
// base32 secret and a otpauth:// URL suitable for QR code generation.
func GenerateTOTPSecret(issuer, accountName string) (secret, otpauthURL string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      issuer,
		AccountName: accountName,
	})
	if err != nil {
		return "", "", fmt.Errorf("totp: generate key: %w", err)
	}
	return key.Secret(), key.URL(), nil
}

// VerifyTOTP validates a 6-digit TOTP code against a stored base32 secret.
func VerifyTOTP(secret, code string) bool {
	return totp.Validate(code, secret)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func generateCode() (string, error) {
	b := make([]byte, 3) // 3 random bytes → max uint 16777215
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	// Convert to a number in [0, 999999] and zero-pad to 6 digits
	n := (int(b[0])<<16 | int(b[1])<<8 | int(b[2])) % 1_000_000
	return fmt.Sprintf("%06d", n), nil
}
