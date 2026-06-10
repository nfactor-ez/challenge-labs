package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"challengelabs/backend/internal/middleware"
	"challengelabs/backend/internal/models"
	"challengelabs/backend/internal/repository"
)

// ChallengeHandler handles CRUD operations for challenges and flag submission.
type ChallengeHandler struct {
	challengeRepo *repository.ChallengeRepository
	progressRepo  *repository.ProgressRepository
}

func NewChallengeHandler(
	challengeRepo *repository.ChallengeRepository,
	progressRepo *repository.ProgressRepository,
) *ChallengeHandler {
	return &ChallengeHandler{
		challengeRepo: challengeRepo,
		progressRepo:  progressRepo,
	}
}

// ─── List ─────────────────────────────────────────────────────────────────────

// List returns all published challenges (or all challenges for admins).
func (h *ChallengeHandler) List(c *gin.Context) {
	role, _ := c.Get(middleware.ContextRole)
	showAll := role == "admin"

	challenges, err := h.challengeRepo.FindAll(!showAll)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch challenges"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"challenges": challenges, "total": len(challenges)})
}

// ─── Get ──────────────────────────────────────────────────────────────────────

// Get returns a single challenge by ID or slug, along with user progress.
func (h *ChallengeHandler) Get(c *gin.Context) {
	challenge, ok := h.resolveChallenge(c)
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	progress, _ := h.progressRepo.FindOne(userID, challenge.ID)
	c.JSON(http.StatusOK, gin.H{"challenge": challenge, "progress": progress})
}

// ─── Create (admin) ───────────────────────────────────────────────────────────

type createChallengeRequest struct {
	Title       string            `json:"title"        binding:"required,max=200"`
	Slug        string            `json:"slug"         binding:"required,max=200"`
	Description string            `json:"description"  binding:"required"`
	Difficulty  models.Difficulty `json:"difficulty"   binding:"required,oneof=easy medium hard"`
	Points      int               `json:"points"       binding:"required,min=10"`
	DockerImage string            `json:"docker_image" binding:"required"`
	Flag        string            `json:"flag"         binding:"required"`
	Tags        string            `json:"tags"`
	CategoryID  uint              `json:"category_id"  binding:"required"`
	IsPublished bool              `json:"is_published"`
	Tasks       []createTaskRequest `json:"tasks"`
}

type createTaskRequest struct {
	Order       int    `json:"order"`
	Title       string `json:"title"  binding:"required"`
	Description string `json:"description"`
	IsRequired  bool   `json:"is_required"`
}

// Create adds a new challenge (admin only). The flag is bcrypt-hashed before storage.
func (h *ChallengeHandler) Create(c *gin.Context) {
	var req createChallengeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	flagHash, err := bcrypt.GenerateFromPassword([]byte(strings.TrimSpace(req.Flag)), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process flag"})
		return
	}

	challenge := &models.Challenge{
		Title:       req.Title,
		Slug:        strings.ToLower(strings.ReplaceAll(req.Slug, " ", "-")),
		Description: req.Description,
		Difficulty:  req.Difficulty,
		Points:      req.Points,
		DockerImage: req.DockerImage,
		Flag:        string(flagHash),
		Tags:        req.Tags,
		CategoryID:  req.CategoryID,
		IsPublished: req.IsPublished,
	}

	for i, t := range req.Tasks {
		challenge.Tasks = append(challenge.Tasks, models.Task{
			Order:       i + 1,
			Title:       t.Title,
			Description: t.Description,
			IsRequired:  t.IsRequired,
		})
	}

	if err = h.challengeRepo.Create(challenge); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create challenge"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"challenge": challenge})
}

// ─── Update (admin) ───────────────────────────────────────────────────────────

// Update modifies an existing challenge (admin only). The flag is only re-hashed if provided.
func (h *ChallengeHandler) Update(c *gin.Context) {
	challenge, ok := h.resolveChallenge(c)
	if !ok {
		return
	}

	var req createChallengeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	challenge.Title = req.Title
	challenge.Description = req.Description
	challenge.Difficulty = req.Difficulty
	challenge.Points = req.Points
	challenge.DockerImage = req.DockerImage
	challenge.Tags = req.Tags
	challenge.IsPublished = req.IsPublished

	if req.Flag != "" {
		hash, _ := bcrypt.GenerateFromPassword([]byte(strings.TrimSpace(req.Flag)), bcrypt.DefaultCost)
		challenge.Flag = string(hash)
	}

	if err := h.challengeRepo.Update(challenge); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update challenge"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"challenge": challenge})
}

// ─── Delete (admin) ───────────────────────────────────────────────────────────

// Delete soft-deletes a challenge by ID (admin only).
func (h *ChallengeHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid challenge id"})
		return
	}
	if err = h.challengeRepo.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete challenge"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "challenge deleted"})
}

// ─── Submit Flag ──────────────────────────────────────────────────────────────

type submitFlagRequest struct {
	Flag string `json:"flag" binding:"required"`
}

// SubmitFlag checks the submitted flag against the stored bcrypt hash and awards points.
func (h *ChallengeHandler) SubmitFlag(c *gin.Context) {
	challenge, ok := h.resolveChallenge(c)
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)

	var req submitFlagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(challenge.Flag), []byte(strings.TrimSpace(req.Flag))); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"correct": false, "message": "incorrect flag"})
		return
	}

	// Record progress
	progress := &models.UserProgress{
		UserID:        userID,
		ChallengeID:   challenge.ID,
		Completed:     true,
		FlagSubmitted: true,
		PointsAwarded: challenge.Points,
	}
	_ = h.progressRepo.Upsert(progress)

	c.JSON(http.StatusOK, gin.H{
		"correct": true,
		"message": "flag accepted! well done.",
		"points":  challenge.Points,
	})
}

// ─── Leaderboard ───────────────────────────────────────────────────────────────

// Leaderboard returns the top-N users ranked by total points.
// GET /api/v1/leaderboard?limit=50
func (h *ChallengeHandler) Leaderboard(c *gin.Context) {
	limit := 50
	if l, err := strconv.Atoi(c.DefaultQuery("limit", "50")); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	entries, err := h.progressRepo.Leaderboard(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch leaderboard"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"leaderboard": entries, "total": len(entries)})
}

// ─── Helper ───────────────────────────────────────────────────────────────────

// resolveChallenge looks up a challenge by numeric ID or slug from the URL param.
func (h *ChallengeHandler) resolveChallenge(c *gin.Context) (*models.Challenge, bool) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		// Fall back to slug lookup
		ch, _ := h.challengeRepo.FindBySlug(idParam)
		if ch == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "challenge not found"})
			return nil, false
		}
		return ch, true
	}
	ch, _ := h.challengeRepo.FindByID(uint(id))
	if ch == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "challenge not found"})
		return nil, false
	}
	return ch, true
}
