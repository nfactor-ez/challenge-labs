package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims are the JWT payload fields.
type Claims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// JWTService handles token generation and validation.
type JWTService struct {
	secret      []byte
	expiryHours int
}

// NewJWTService creates a JWTService with the given HMAC secret and token lifetime.
func NewJWTService(secret string, expiryHours int) *JWTService {
	return &JWTService{
		secret:      []byte(secret),
		expiryHours: expiryHours,
	}
}

// GenerateToken creates a signed HS256 JWT for the given user.
func (j *JWTService) GenerateToken(userID uint, username, role string) (string, error) {
	claims := Claims{
		UserID:   userID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(j.expiryHours) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "challengelabs",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(j.secret)
}

// GenerateTempMFAToken creates a short-lived (5 min) token for the MFA verification step.
// It carries the special role "mfa_pending" so it cannot be used as a real auth token.
func (j *JWTService) GenerateTempMFAToken(userID uint) (string, error) {
	claims := Claims{
		UserID:   userID,
		Username: "",
		Role:     "mfa_pending",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "challengelabs-mfa",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(j.secret)
}

// ValidateTempMFAToken validates a temp MFA token and returns the user ID.
func (j *JWTService) ValidateTempMFAToken(tokenString string) (uint, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return j.secret, nil
	})
	if err != nil {
		return 0, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid || claims.Role != "mfa_pending" {
		return 0, errors.New("invalid MFA token")
	}
	return claims.UserID, nil
}

// ValidateToken parses and validates a JWT string, returning the embedded Claims.
func (j *JWTService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return j.secret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	// Reject temp MFA tokens from being used as real auth tokens
	if claims.Role == "mfa_pending" {
		return nil, errors.New("token not yet authorized")
	}
	return claims, nil
}
