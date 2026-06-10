package handlers

import (
	"crypto/rand"
	"encoding/hex"
)

// generateSessionKey generates a cryptographically random 64-character hex string
// to use as the unique, unguessable session identifier.
func generateSessionKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
