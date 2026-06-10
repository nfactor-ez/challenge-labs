.PHONY: run build seed tidy lint docker-up docker-down

# ── Development ───────────────────────────────────────────────────────────────

# Run the development server (STORE=memory by default in .env)
run:
	go run ./cmd/server/...

# Seed the PostgreSQL database with categories, challenges, and an admin user
seed:
	go run ./cmd/seed/...

# Build the production binary
build:
	go build -o bin/server ./cmd/server/...

# ── Code quality ──────────────────────────────────────────────────────────────

# Tidy and verify go modules
tidy:
	go mod tidy
	go mod verify

# Lint (requires golangci-lint)
lint:
	golangci-lint run ./...

# ── Docker ────────────────────────────────────────────────────────────────────

# Start PostgreSQL via docker-compose
docker-up:
	docker compose up -d

# Stop and remove docker-compose services
docker-down:
	docker compose down

# Rebuild and run the full stack (API + PostgreSQL) in docker-compose
docker-stack:
	docker compose up --build
