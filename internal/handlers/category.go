package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"challengelabs/backend/internal/repository"
	"challengelabs/backend/internal/models"
)

// CategoryHandler handles public listing and admin CRUD for challenge categories.
type CategoryHandler struct {
	categoryRepo *repository.CategoryRepository
}

func NewCategoryHandler(categoryRepo *repository.CategoryRepository) *CategoryHandler {
	return &CategoryHandler{categoryRepo: categoryRepo}
}

// ─── List (public) ────────────────────────────────────────────────────────────

// List returns all categories ordered alphabetically.
// GET /api/v1/categories
func (h *CategoryHandler) List(c *gin.Context) {
	categories, err := h.categoryRepo.FindAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch categories"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"categories": categories, "total": len(categories)})
}

// ─── Create (admin) ───────────────────────────────────────────────────────────

type createCategoryRequest struct {
	Name        string `json:"name"        binding:"required,max=100"`
	Slug        string `json:"slug"        binding:"required,max=100"`
	Description string `json:"description"`
}

// Create adds a new category (admin only).
// POST /api/v1/admin/categories
func (h *CategoryHandler) Create(c *gin.Context) {
	var req createCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	category := &models.Category{
		Name:        strings.TrimSpace(req.Name),
		Slug:        strings.ToLower(strings.ReplaceAll(strings.TrimSpace(req.Slug), " ", "-")),
		Description: req.Description,
	}

	if err := h.categoryRepo.Create(category); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create category"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"category": category})
}

// ─── Update (admin) ───────────────────────────────────────────────────────────

// Update modifies an existing category (admin only).
// PUT /api/v1/admin/categories/:id
func (h *CategoryHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category id"})
		return
	}

	category, _ := h.categoryRepo.FindByID(uint(id))
	if category == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
		return
	}

	var req createCategoryRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	category.Name = strings.TrimSpace(req.Name)
	category.Slug = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(req.Slug), " ", "-"))
	category.Description = req.Description

	if err = h.categoryRepo.Update(category); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update category"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"category": category})
}

// ─── Delete (admin) ───────────────────────────────────────────────────────────

// Delete removes a category by ID (admin only).
// DELETE /api/v1/admin/categories/:id
func (h *CategoryHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category id"})
		return
	}
	if err = h.categoryRepo.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete category"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "category deleted"})
}
