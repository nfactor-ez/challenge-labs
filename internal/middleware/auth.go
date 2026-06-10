package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"challengelabs/backend/internal/auth"
)

const (
	ContextUserID   = "userID"
	ContextUsername = "username"
	ContextRole     = "role"
)

// AuthRequired verifies the JWT from the Authorization header or ?token= query param.
// The query param fallback is required for WebSocket upgrade requests, which cannot
// carry custom headers in all browsers.
func AuthRequired(jwtSvc *auth.JWTService) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization token required"})
			return
		}

		claims, err := jwtSvc.ValidateToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextUsername, claims.Username)
		c.Set(ContextRole, claims.Role)
		c.Next()
	}
}

// AdminRequired aborts with 403 if the authenticated user is not an admin.
// Must be placed after AuthRequired in the middleware chain.
func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get(ContextRole)
		if role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin access required"})
			return
		}
		c.Next()
	}
}

// GetUserID is a typed helper to retrieve the authenticated user's ID from gin context.
func GetUserID(c *gin.Context) uint {
	id, _ := c.Get(ContextUserID)
	uid, _ := id.(uint)
	return uid
}

// extractToken pulls the raw JWT from the Authorization header or the token query param.
func extractToken(c *gin.Context) string {
	bearer := c.GetHeader("Authorization")
	if strings.HasPrefix(bearer, "Bearer ") {
		return strings.TrimPrefix(bearer, "Bearer ")
	}
	return c.Query("token")
}
