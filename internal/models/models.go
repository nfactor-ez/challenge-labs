package models

import (
	"time"

	"gorm.io/gorm"
)

// ─── User ─────────────────────────────────────────────────────────────────────

type User struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Username     string `gorm:"uniqueIndex;not null;size:50" json:"username"`
	Email        string `gorm:"uniqueIndex;not null;size:255" json:"email"`
	PasswordHash string `gorm:"not null" json:"-"`
	Role         string `gorm:"default:user;size:20" json:"role"` // user | admin
	AvatarURL    string `gorm:"size:500" json:"avatar_url,omitempty"`

	// MFA (TOTP — Google Authenticator compatible)
	MFAEnabled    bool   `gorm:"default:false" json:"mfa_enabled"`
	MFATOTPSecret string `gorm:"size:64" json:"-"` // base32 TOTP secret, never exposed

	// Subscription
	IsPremium         bool       `gorm:"default:false" json:"is_premium"`
	PremiumGrantedAt  *time.Time `gorm:"index" json:"premium_granted_at,omitempty"`
	PremiumExpiresAt  *time.Time `gorm:"index" json:"premium_expires_at,omitempty"`

	Sessions []Session `gorm:"foreignKey:UserID" json:"-"`
}

// ─── Category ─────────────────────────────────────────────────────────────────

type Category struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	CreatedAt   time.Time `json:"created_at"`
	Name        string    `gorm:"uniqueIndex;not null;size:100" json:"name"`
	Slug        string    `gorm:"uniqueIndex;not null;size:100" json:"slug"`
	Description string    `gorm:"type:text" json:"description"`
	Challenges  []Challenge `gorm:"foreignKey:CategoryID" json:"-"`
}

// ─── Challenge ────────────────────────────────────────────────────────────────

type Difficulty string

const (
	DifficultyEasy   Difficulty = "easy"
	DifficultyMedium Difficulty = "medium"
	DifficultyHard   Difficulty = "hard"
)

type Challenge struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Title       string     `gorm:"not null;size:200" json:"title"`
	Slug        string     `gorm:"uniqueIndex;not null;size:200" json:"slug"`
	Description string     `gorm:"type:text" json:"description"` // Markdown
	Difficulty  Difficulty `gorm:"not null;size:20" json:"difficulty"`
	Points      int        `gorm:"default:100" json:"points"`
	DockerImage string     `gorm:"not null;size:300" json:"docker_image"`
	Flag        string     `gorm:"not null;size:500" json:"-"` // stored bcrypt-hashed
	Tags        string     `gorm:"size:500" json:"tags"`       // comma-separated
	IsPublished bool       `gorm:"default:false" json:"is_published"`
	IsPremium   bool       `gorm:"default:false" json:"is_premium"` // requires premium subscription
	CategoryID  uint       `json:"category_id"`
	Category    Category   `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	Tasks       []Task     `gorm:"foreignKey:ChallengeID;constraint:OnDelete:CASCADE" json:"tasks,omitempty"`
}

// ─── Task ─────────────────────────────────────────────────────────────────────

type Task struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	ChallengeID uint   `gorm:"not null;index" json:"challenge_id"`
	Order       int    `gorm:"not null" json:"order"`
	Title       string `gorm:"not null;size:300" json:"title"`
	Description string `gorm:"type:text" json:"description"`
	IsRequired  bool   `gorm:"default:true" json:"is_required"`
}

// ─── Session ──────────────────────────────────────────────────────────────────

type SessionStatus string

const (
	SessionStatusBooting     SessionStatus = "booting"
	SessionStatusActive      SessionStatus = "active"
	SessionStatusTerminating SessionStatus = "terminating"
	SessionStatusExpired     SessionStatus = "expired"
	SessionStatusError       SessionStatus = "error"
)

type Session struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID       uint          `gorm:"not null;index" json:"user_id"`
	ChallengeID  *uint         `gorm:"index" json:"challenge_id"`
	ContainerID  string        `gorm:"size:100;index" json:"container_id"`
	SessionKey   string        `gorm:"uniqueIndex;not null;size:64" json:"session_key"`
	Status       SessionStatus `gorm:"not null;default:booting;size:20" json:"status"`
	ContainerIP  string        `gorm:"size:50" json:"container_ip"`
	ExpiresAt    time.Time     `gorm:"not null" json:"expires_at"`
	LastActiveAt time.Time     `json:"last_active_at"`

	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Challenge *Challenge `gorm:"foreignKey:ChallengeID" json:"challenge,omitempty"`
}

// IsExpired returns true if the session's TTL has elapsed.
func (s *Session) IsExpired() bool {
	return time.Now().After(s.ExpiresAt)
}

// RemainingSeconds returns the number of seconds until the session expires (0 if already expired).
func (s *Session) RemainingSeconds() int64 {
	rem := time.Until(s.ExpiresAt).Seconds()
	if rem < 0 {
		return 0
	}
	return int64(rem)
}

// ─── UserProgress ─────────────────────────────────────────────────────────────

type UserProgress struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	UserID      uint       `gorm:"not null;uniqueIndex:idx_user_challenge" json:"user_id"`
	ChallengeID uint       `gorm:"not null;uniqueIndex:idx_user_challenge" json:"challenge_id"`
	Completed   bool       `gorm:"default:false" json:"completed"`
	FlagSubmitted bool     `gorm:"default:false" json:"flag_submitted"`
	PointsAwarded int      `gorm:"default:0" json:"points_awarded"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

// ─── SiteSetting ──────────────────────────────────────────────────────────────
// Stores global admin-configurable settings as key-value pairs.

type SiteSetting struct {
	Key   string `gorm:"primaryKey;size:100" json:"key"`
	Value string `gorm:"not null;size:500"   json:"value"`
}


type OTPCode struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	Email     string    `gorm:"not null;size:255;index" json:"email"`
	CodeHash  string    `gorm:"not null;size:256" json:"-"` // bcrypt hash of the 6-digit code
	Purpose   string    `gorm:"not null;size:30" json:"purpose"` // "registration" | "forgot_password"
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	Used      bool      `gorm:"default:false" json:"used"`
}
