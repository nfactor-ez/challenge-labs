package repository

import (
	"errors"
	"time"

	"challengelabs/backend/internal/models"

	"gorm.io/gorm"
)

// ─── User Repository ──────────────────────────────────────────────────────────

type UserRepository struct{ db *gorm.DB }

func NewUserRepository(db *gorm.DB) *UserRepository { return &UserRepository{db: db} }

func (r *UserRepository) Create(u *models.User) error {
	return r.db.Create(u).Error
}

func (r *UserRepository) FindByID(id uint) (*models.User, error) {
	var u models.User
	err := r.db.First(&u, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	var u models.User
	err := r.db.Where("email = ?", email).First(&u).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepository) FindByUsername(username string) (*models.User, error) {
	var u models.User
	err := r.db.Where("username = ?", username).First(&u).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepository) Update(u *models.User) error {
	return r.db.Save(u).Error
}

func (r *UserRepository) ListAll(page, pageSize int) ([]models.User, int64, error) {
	var users []models.User
	var total int64
	offset := (page - 1) * pageSize
	if err := r.db.Model(&models.User{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := r.db.Limit(pageSize).Offset(offset).Find(&users).Error
	return users, total, err
}

func (r *UserRepository) CountAll() (int64, error) {
	var count int64
	return count, r.db.Model(&models.User{}).Count(&count).Error
}

// ─── Challenge Repository ─────────────────────────────────────────────────────

type ChallengeRepository struct{ db *gorm.DB }

func NewChallengeRepository(db *gorm.DB) *ChallengeRepository {
	return &ChallengeRepository{db: db}
}

func (r *ChallengeRepository) FindAll(onlyPublished bool) ([]models.Challenge, error) {
	var challenges []models.Challenge
	q := r.db.Preload("Category").Preload("Tasks")
	if onlyPublished {
		q = q.Where("is_published = ?", true)
	}
	err := q.Find(&challenges).Error
	return challenges, err
}

func (r *ChallengeRepository) FindByID(id uint) (*models.Challenge, error) {
	var c models.Challenge
	err := r.db.Preload("Category").Preload("Tasks", func(db *gorm.DB) *gorm.DB {
		return db.Order("tasks.order ASC")
	}).First(&c, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &c, err
}

func (r *ChallengeRepository) FindBySlug(slug string) (*models.Challenge, error) {
	var c models.Challenge
	err := r.db.Preload("Category").Preload("Tasks", func(db *gorm.DB) *gorm.DB {
		return db.Order("tasks.order ASC")
	}).Where("slug = ?", slug).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &c, err
}

func (r *ChallengeRepository) Create(c *models.Challenge) error {
	return r.db.Create(c).Error
}

func (r *ChallengeRepository) Update(c *models.Challenge) error {
	return r.db.Save(c).Error
}

func (r *ChallengeRepository) Delete(id uint) error {
	return r.db.Delete(&models.Challenge{}, id).Error
}

func (r *ChallengeRepository) CountAll() (int64, error) {
	var count int64
	return count, r.db.Model(&models.Challenge{}).Count(&count).Error
}

// ─── Session Repository ───────────────────────────────────────────────────────

type SessionRepository struct{ db *gorm.DB }

func NewSessionRepository(db *gorm.DB) *SessionRepository {
	return &SessionRepository{db: db}
}

func (r *SessionRepository) Create(s *models.Session) error {
	return r.db.Create(s).Error
}

func (r *SessionRepository) FindByID(id uint) (*models.Session, error) {
	var s models.Session
	err := r.db.Preload("Challenge").Preload("User").First(&s, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &s, err
}

func (r *SessionRepository) FindByKey(key string) (*models.Session, error) {
	var s models.Session
	err := r.db.Preload("Challenge").Preload("User").
		Where("session_key = ?", key).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &s, err
}

func (r *SessionRepository) FindByContainerID(containerID string) (*models.Session, error) {
	var s models.Session
	err := r.db.Where("container_id = ?", containerID).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &s, err
}

func (r *SessionRepository) FindActiveByUserAndChallenge(userID, challengeID uint) (*models.Session, error) {
	var s models.Session
	err := r.db.Preload("Challenge").
		Where(
			"user_id = ? AND challenge_id = ? AND status IN ? AND expires_at > ?",
			userID, challengeID,
			[]models.SessionStatus{models.SessionStatusBooting, models.SessionStatusActive},
			time.Now(),
		).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &s, err
}

func (r *SessionRepository) FindActiveByUser(userID uint) ([]models.Session, error) {
	var sessions []models.Session
	err := r.db.Preload("Challenge").
		Where(
			"user_id = ? AND status IN ? AND expires_at > ?",
			userID,
			[]models.SessionStatus{models.SessionStatusBooting, models.SessionStatusActive},
			time.Now(),
		).Find(&sessions).Error
	return sessions, err
}

func (r *SessionRepository) FindActiveByAllUsers() ([]models.Session, error) {
	var sessions []models.Session
	err := r.db.Where(
		"status IN ? AND expires_at > ?",
		[]models.SessionStatus{models.SessionStatusActive},
		time.Now(),
	).Find(&sessions).Error
	return sessions, err
}

func (r *SessionRepository) FindExpired() ([]models.Session, error) {
	var sessions []models.Session
	err := r.db.Where(
		"status IN ? AND expires_at <= ?",
		[]models.SessionStatus{models.SessionStatusBooting, models.SessionStatusActive},
		time.Now(),
	).Find(&sessions).Error
	return sessions, err
}

func (r *SessionRepository) FindIdleExpired(idleTimeout time.Duration) ([]models.Session, error) {
	var sessions []models.Session
	cutoff := time.Now().Add(-idleTimeout)
	err := r.db.Where(
		"status = ? AND last_active_at < ?",
		models.SessionStatusActive, cutoff,
	).Find(&sessions).Error
	return sessions, err
}

func (r *SessionRepository) UpdateStatus(id uint, status models.SessionStatus) error {
	return r.db.Model(&models.Session{}).Where("id = ?", id).
		Update("status", status).Error
}

func (r *SessionRepository) UpdateLastActive(id uint) error {
	return r.db.Model(&models.Session{}).Where("id = ?", id).
		Update("last_active_at", time.Now()).Error
}

func (r *SessionRepository) Update(s *models.Session) error {
	return r.db.Save(s).Error
}

func (r *SessionRepository) CountActiveSessions() (int64, error) {
	var count int64
	err := r.db.Model(&models.Session{}).
		Where("status IN ?",
			[]models.SessionStatus{models.SessionStatusBooting, models.SessionStatusActive}).
		Count(&count).Error
	return count, err
}

// ─── Progress Repository ──────────────────────────────────────────────────────

type ProgressRepository struct{ db *gorm.DB }

func NewProgressRepository(db *gorm.DB) *ProgressRepository {
	return &ProgressRepository{db: db}
}

func (r *ProgressRepository) Upsert(p *models.UserProgress) error {
	return r.db.
		Where(models.UserProgress{UserID: p.UserID, ChallengeID: p.ChallengeID}).
		Assign(*p).
		FirstOrCreate(p).Error
}

func (r *ProgressRepository) FindByUser(userID uint) ([]models.UserProgress, error) {
	var list []models.UserProgress
	err := r.db.Where("user_id = ?", userID).Find(&list).Error
	return list, err
}

func (r *ProgressRepository) FindOne(userID, challengeID uint) (*models.UserProgress, error) {
	var p models.UserProgress
	err := r.db.Where("user_id = ? AND challenge_id = ?", userID, challengeID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &p, err
}

// LeaderboardEntry represents one ranked user on the leaderboard.
type LeaderboardEntry struct {
	Rank           int    `json:"rank"`
	UserID         uint   `json:"user_id"`
	Username       string `json:"username"`
	AvatarURL      string `json:"avatar_url"`
	TotalPoints    int    `json:"total_points"`
	ChallengesSolved int  `json:"challenges_solved"`
}

// Leaderboard returns the top-N users ranked by total points awarded.
func (r *ProgressRepository) Leaderboard(limit int) ([]LeaderboardEntry, error) {
	type row struct {
		UserID           uint
		Username         string
		AvatarURL        string
		TotalPoints      int
		ChallengesSolved int
	}
	var rows []row
	err := r.db.Table("user_progresses up").
		Select("up.user_id, u.username, u.avatar_url, SUM(up.points_awarded) AS total_points, COUNT(*) AS challenges_solved").
		Joins("JOIN users u ON u.id = up.user_id").
		Where("up.completed = ? AND u.deleted_at IS NULL", true).
		Group("up.user_id, u.username, u.avatar_url").
		Order("total_points DESC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	entries := make([]LeaderboardEntry, len(rows))
	for i, r := range rows {
		entries[i] = LeaderboardEntry{
			Rank:             i + 1,
			UserID:           r.UserID,
			Username:         r.Username,
			AvatarURL:        r.AvatarURL,
			TotalPoints:      r.TotalPoints,
			ChallengesSolved: r.ChallengesSolved,
		}
	}
	return entries, nil
}

// ─── Category Repository ──────────────────────────────────────────────────────

type CategoryRepository struct{ db *gorm.DB }

func NewCategoryRepository(db *gorm.DB) *CategoryRepository {
	return &CategoryRepository{db: db}
}

func (r *CategoryRepository) FindAll() ([]models.Category, error) {
	var categories []models.Category
	err := r.db.Order("name ASC").Find(&categories).Error
	return categories, err
}

func (r *CategoryRepository) FindByID(id uint) (*models.Category, error) {
	var c models.Category
	err := r.db.First(&c, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &c, err
}

func (r *CategoryRepository) Create(c *models.Category) error {
	return r.db.Create(c).Error
}

func (r *CategoryRepository) Update(c *models.Category) error {
	return r.db.Save(c).Error
}

func (r *CategoryRepository) Delete(id uint) error {
	return r.db.Delete(&models.Category{}, id).Error
}
