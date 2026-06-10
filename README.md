# ChallengeLabs

A proof-of-concept backend and frontend for containerized challenge sessions.

This repository includes:
- A Go backend API server with Docker-based terminal session support.
- A static HTML/CSS/JS frontend to launch challenge sessions and connect to a live terminal.
- A Docker Compose setup to run PostgreSQL, the API, and the frontend together.
- Local development support using `memory` session store or PostgreSQL.

> Note: `.env` is included in this repository for this proof of concept. It is not currently holding highly sensitive data, but it should be replaced or secured before production use.

## Quick start

### Clone the repository

```bash
git clone https://github.com/nfactor-ez/challenge-labs.git
cd challenge-labs
```

### Run with Docker Compose

This is the easiest way to run the full POC.

```bash
docker compose up --build
```

Then open the frontend in your browser:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8081`

### What this starts

- `cl_postgres` — PostgreSQL database service.
- `cl_api` — Go API backend.
- `cl_frontend` — Static frontend served on port `3000`.

## Repository structure

- `cmd/server` — Go backend server entry point.
- `cmd/seed` — seed data helper.
- `config` — environment and config loader.
- `internal` — backend business logic, routes, session handling, auth, scheduler, and terminal integration.
- `frontend` — static frontend files and Docker container.
- `docker-compose.yml` — development topology for the POC.
- `.env` — environment variables for local development.

## Backend details

The backend listens on `8080` inside the container and is exposed on host `8081`.
The frontend uses `http://localhost:8081` to reach the API.

The backend is configured to use the Docker socket so it can start sandbox containers for challenge sessions.

### Backend options

You can run the backend in two modes:

1. `STORE=postgres` (default in compose) — uses PostgreSQL.
2. `STORE=memory` — runs without any database.

To use the memory store for a faster test (without Postgres), set:

```bash
STORE=memory
```

## Frontend details

The frontend is a small static site that launches challenge sessions and opens a live terminal panel.

- `frontend/index.html` — main page.
- `frontend/styles.css` — black, green, white theme.
- `frontend/app.js` — challenge listing and terminal connection logic.

## Running backend and frontend manually

If you want to run the backend directly with Go, first install Go 1.25 or later.

```bash
go run ./cmd/server
```

Then open the frontend files directly or serve `frontend/` with any static server.

## Environment variables

The repository includes a working `.env` file for development. The current `.env` values are intended for this POC and are not intended for production.

Important values:

- `SERVER_PORT=8080`
- `ENV=development`
- `STORE=postgres`
- `DB_HOST=localhost`
- `DB_PORT=5433`
- `DB_USER=postgres`
- `DB_PASSWORD=postgres`
- `DB_NAME=challengelabs`
- `JWT_SECRET=challengelabs-super-secret-key-change-in-prod-2024`
- `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173`

### Note about `.env`

This repository is intentionally pushing `.env` for the POC.
It does not contain production secrets, but you should still update the values before using this project beyond development.

## Troubleshooting

- If you get a port conflict, stop the service using the port or change the exposed port in `docker-compose.yml`.
- If `docker compose` fails to build, ensure Docker Desktop is running and that your machine has access to the Docker socket.
- If the frontend cannot reach the backend, confirm `cl_api` is healthy and that `http://localhost:8081` responds.

## How to test

1. Start the stack with `docker compose up --build`.
2. Open `http://localhost:3000`.
3. Click a challenge and launch the terminal.
4. Confirm the right-hand terminal panel appears and connects successfully.

## Additional notes for reviewers

- The project is built as a POC, not a production deployment.
- The current Docker Compose setup includes both the backend and frontend for quick evaluation.
- `.env` is included for convenience and should be rotated for real deployments.
