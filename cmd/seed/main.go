// Package main provides a one-shot database seeder for ChallengeLabs.
// Run with: go run ./cmd/seed/...
//
// It creates an admin user, sample categories, and sample challenges.
// Existing rows are left untouched (idempotent via FirstOrCreate).
package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"challengelabs/backend/internal/models"
)

func main() {
	// Try loading .env from current directory first, then from parent directories
	// This handles both `go run ./cmd/seed/...` and running from project root
	for _, path := range []string{".env", "../.env", "../../.env"} {
		if err := godotenv.Load(path); err == nil {
			break
		}
	}

	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s&TimeZone=UTC",
		getEnv("DB_USER", "postgres"),
		getEnv("DB_PASSWORD", "postgres"),
		getEnv("DB_HOST", "localhost"),
		getEnv("DB_PORT", "5432"),
		getEnv("DB_NAME", "challengelabs"),
		getEnv("DB_SSLMODE", "disable"),
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "DB connection failed: %v\n", err)
		os.Exit(1)
	}

	// Auto-migrate all models
	if err = db.AutoMigrate(
		&models.User{},
		&models.Category{},
		&models.Challenge{},
		&models.Task{},
		&models.Session{},
		&models.UserProgress{},
	); err != nil {
		fmt.Fprintf(os.Stderr, "Migration failed: %v\n", err)
		os.Exit(1)
	}

	seedAdmin(db)
	cats := seedCategories(db)
	seedChallenges(db, cats)

	fmt.Println("\n✅  Seed complete.")
}

// ─── Admin User ───────────────────────────────────────────────────────────────

func seedAdmin(db *gorm.DB) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("admin1234"), bcrypt.DefaultCost)
	admin := models.User{
		Username:     "admin",
		Email:        "admin@challengelabs.local",
		PasswordHash: string(hash),
		Role:         "admin",
	}
	result := db.Where(models.User{Email: admin.Email}).FirstOrCreate(&admin)
	if result.RowsAffected > 0 {
		fmt.Println("  Created admin user  (email: admin@challengelabs.local  password: admin1234)")
	} else {
		fmt.Println("  Admin user already exists — skipped")
	}
}

// ─── Categories ───────────────────────────────────────────────────────────────

type categoryDef struct {
	Name        string
	Slug        string
	Description string
}

var categoryDefs = []categoryDef{
	{"Web Exploitation", "web", "HTTP, APIs, SQL injection, XSS, SSRF, and more."},
	{"Binary Exploitation", "pwn", "Buffer overflows, ROP chains, heap exploitation."},
	{"Reverse Engineering", "rev", "Disassembly, decompilation, and bytecode analysis."},
	{"Cryptography", "crypto", "Breaking ciphers, hash collisions, and key recovery."},
	{"Forensics", "forensics", "Disk images, network captures, and memory dumps."},
	{"Miscellaneous", "misc", "Everything that doesn't fit elsewhere."},
}

func seedCategories(db *gorm.DB) map[string]*models.Category {
	cats := map[string]*models.Category{}
	for _, d := range categoryDefs {
		cat := models.Category{Slug: d.Slug}
		db.Where(models.Category{Slug: d.Slug}).FirstOrCreate(&cat, models.Category{
			Name:        d.Name,
			Slug:        d.Slug,
			Description: d.Description,
		})
		cats[d.Slug] = &cat
		fmt.Printf("  Category: %s\n", d.Name)
	}
	return cats
}

// ─── Challenges ───────────────────────────────────────────────────────────────

type challengeDef struct {
	Title       string
	Slug        string
	Description string
	Difficulty  models.Difficulty
	Points      int
	DockerImage string
	Flag        string
	Tags        string
	Category    string
	Published   bool
	Tasks       []models.Task
}

var challengeDefs = []challengeDef{
	{
		Title:       "Hello, Shell!",
		Slug:        "hello-shell",
		Description: "# Hello, Shell!\n\nWelcome to ChallengeLabs. Your first task is simple: find the flag hidden somewhere on this container's filesystem.\n\n**Hint:** Try `find / -name flag.txt 2>/dev/null`",
		Difficulty:  models.DifficultyEasy,
		Points:      50,
		DockerImage: "alpine",
		Flag:        "flag{w3lc0me_to_ch4ll3ng3labs}",
		Tags:        "linux,beginner,shell",
		Category:    "misc",
		Published:   true,
		Tasks: []models.Task{
			{Order: 1, Title: "Connect to the container", Description: "Use the terminal to connect to your challenge instance.", IsRequired: true},
			{Order: 2, Title: "Find the flag file", Description: "Locate `/flag.txt` on the filesystem.", IsRequired: true},
		},
	},
	{
		Title:       "SQL Injection 101",
		Slug:        "sqli-101",
		Description: "# SQL Injection 101\n\nA simple login form sits behind a web server running in this container. Can you bypass authentication?\n\n```\nUsername: admin' --\nPassword: anything\n```",
		Difficulty:  models.DifficultyEasy,
		Points:      100,
		DockerImage: "alpine",
		Flag:        "flag{sql1_byp4ss_4uth}",
		Tags:        "web,sqli,auth-bypass",
		Category:    "web",
		Published:   true,
		Tasks: []models.Task{
			{Order: 1, Title: "Identify the login form", Description: "Navigate to port 8000 inside the container.", IsRequired: true},
			{Order: 2, Title: "Craft the injection payload", Description: "Bypass the login by injecting SQL into the username field.", IsRequired: true},
			{Order: 3, Title: "Read the flag", Description: "Retrieve the flag from the authenticated dashboard.", IsRequired: true},
		},
	},
	{
		Title:       "Buffer Overflow Basics",
		Slug:        "bof-basics",
		Description: "# Buffer Overflow Basics\n\nA deliberately vulnerable C binary is waiting for you. Overflow its local buffer to overwrite the return address and gain a shell.\n\n**Tools:** `gdb`, `pwntools`, `python3`",
		Difficulty:  models.DifficultyMedium,
		Points:      200,
		DockerImage: "alpine",
		Flag:        "flag{rop_g0es_br4in}",
		Tags:        "pwn,bof,stack",
		Category:    "pwn",
		Published:   true,
		Tasks: []models.Task{
			{Order: 1, Title: "Analyse the binary", Description: "Run `file` and `checksec` to understand the protections in place.", IsRequired: true},
			{Order: 2, Title: "Find the offset", Description: "Use a cyclic pattern to determine the exact offset to EIP/RIP.", IsRequired: true},
			{Order: 3, Title: "Craft the exploit", Description: "Write a payload that overwrites the return address and pops a shell.", IsRequired: true},
		},
	},
	{
		Title:       "Caesar's Secret",
		Slug:        "caesars-secret",
		Description: "# Caesar's Secret\n\nYou've intercepted an encoded message: `synt{ebg13_vf_abg_rapelcgvba}`. Decode it to reveal the flag.",
		Difficulty:  models.DifficultyEasy,
		Points:      25,
		DockerImage: "alpine",
		Flag:        "flag{rot13_is_not_encryption}",
		Tags:        "crypto,rot13,classical",
		Category:    "crypto",
		Published:   true,
		Tasks: []models.Task{
			{Order: 1, Title: "Identify the cipher", Description: "What type of substitution cipher is this?", IsRequired: true},
			{Order: 2, Title: "Decode the message", Description: "Apply the correct rotation to recover the plaintext.", IsRequired: true},
		},
	},
}

func seedChallenges(db *gorm.DB, cats map[string]*models.Category) {
	for _, d := range challengeDefs {
		slug := strings.ToLower(strings.ReplaceAll(d.Slug, " ", "-"))
		cat, ok := cats[d.Category]
		if !ok {
			fmt.Printf("  ⚠ Category %q not found for challenge %q — skipping\n", d.Category, d.Title)
			continue
		}

		flagHash, _ := bcrypt.GenerateFromPassword([]byte(d.Flag), bcrypt.DefaultCost)

		ch := models.Challenge{}
		result := db.Where(models.Challenge{Slug: slug}).First(&ch)
		if result.Error == nil {
			fmt.Printf("  Challenge already exists: %s — skipped\n", d.Title)
			continue
		}

		ch = models.Challenge{
			Title:       d.Title,
			Slug:        slug,
			Description: d.Description,
			Difficulty:  d.Difficulty,
			Points:      d.Points,
			DockerImage: d.DockerImage,
			Flag:        string(flagHash),
			Tags:        d.Tags,
			CategoryID:  cat.ID,
			IsPublished: d.Published,
			Tasks:       d.Tasks,
		}
		if err := db.Create(&ch).Error; err != nil {
			fmt.Fprintf(os.Stderr, "  ❌ Failed to create challenge %q: %v\n", d.Title, err)
			continue
		}
		fmt.Printf("  Challenge: %-30s  [%s, %d pts]\n", d.Title, d.Difficulty, d.Points)
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
