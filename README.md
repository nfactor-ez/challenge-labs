# ChallengeLabs

A proof-of-concept backend and frontend for containerized challenge sessions.

This repository includes:
- A Go backend API server with Docker-based terminal session support.
- A static HTML/CSS/JS frontend to launch challenge sessions and connect to a live terminal.
- A Docker Compose setup to run PostgreSQL, the API, and the frontend together.
- Local development support using `memory` session store or PostgreSQL.

> Note: `.env` is included in this repository for this proof of concept. It is not currently holding highly sensitive data, but it should be replaced or secured before production use.

## Instructions

### Prerequisites

To run this repository locally, you need:

- Git (`git`) installed
- Docker Desktop or Docker Engine installed
- Docker Compose support
- (Optional) Go 1.25+ if you want to run the backend directly without Docker

### Docker installation

#### Windows

1. Install Docker Desktop from https://www.docker.com/products/docker-desktop
2. Start Docker Desktop and confirm it is running
3. Enable WSL 2 integration if prompted
4. Open PowerShell and verify:

```powershell
docker version
docker compose version
```

#### macOS

1. Install Docker Desktop from https://www.docker.com/products/docker-desktop
2. Start Docker Desktop
3. Verify with:

```bash
docker version
docker compose version
```

#### Linux

1. Install Docker Engine using your distribution package manager
2. Install Docker Compose v2 or ensure `docker compose` is available
3. Verify with:

```bash
sudo docker version
docker compose version
```

### Recommended environment

- `Docker Desktop` for Windows/macOS
- `PowerShell`, `Git Bash`, or Terminal
- `localhost` access to ports `3000`, `8081`, and `5433`

### Clone the repository

```bash
git clone https://github.com/nfactor-ez/challenge-labs.git
cd challenge-labs
```

### Important files

- `Dockerfile` — backend container image builder
- `docker-compose.yml` — orchestration for frontend, backend, and PostgreSQL
- `.env` — development environment variables for the backend
- `frontend/Dockerfile` — static frontend container
- `frontend/index.html` — frontend page
- `frontend/styles.css` — UI theme and layout
- `frontend/app.js` — frontend logic for challenge launch and terminal connection
- `internal/` — backend application logic, routes, session handling, and terminal support

## How to run

### Run with Docker Compose

This is the recommended way to run everything together.

```bash
docker compose up --build
```

This command:
- builds the backend and frontend Docker images
- starts PostgreSQL in `cl_postgres`
- starts the Go API backend in `cl_api`
- starts the frontend web app in `cl_frontend`

### Access the application

- Frontend: `http://localhost:3000`
- Backend API health: `http://localhost:8081/health`

### Services and ports

- `cl_frontend` → exposed on host `3000`
- `cl_api` → exposed on host `8081`, internal container port `8080`
- `cl_postgres` → exposed on host `5433`, internal container port `5432`

### Run backend manually

If you prefer not to use Docker for the backend, install Go 1.25 or newer.

```bash
go run ./cmd/server
```

Then serve the `frontend/` directory with any static server or open `frontend/index.html` in a browser.

### Test the application

1. Start the stack with `docker compose up --build`.
2. Open `http://localhost:3000`.
3. Click a challenge and launch the terminal.
4. Confirm the right-hand terminal panel appears and connects successfully.

## Details

### What this project does

This POC shows a simple platform where users can:
- choose a challenge from a list
- launch a container-backed terminal session for that challenge
- interact with the terminal through a browser-based UI
- run the complete stack with Docker Compose for quick evaluation

The backend uses the Docker socket to create sandbox containers and delivers terminal data over WebSocket.

### Environment variables and configuration

The repository contains a `.env` file for local development. The `.env` file is intentionally included in this POC, but it should be changed before production use.

Important `.env` values:

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

### Changing the database mode

The backend supports two storage modes:

- `STORE=postgres` — uses PostgreSQL (recommended for this demo)
- `STORE=memory` — no database required

To run without PostgreSQL, set:

```bash
STORE=memory
```

## Frontend details

The frontend is a minimal, proof-of-concept UI that:
- lists available challenge templates
- launches a backend session for a challenge
- opens a live terminal panel on the right side
- connects to the backend over WebSocket

Frontend files:

- `frontend/index.html` — main page structure
- `frontend/styles.css` — black, green, white theme and responsive layout
- `frontend/app.js` — client-side challenge launch and terminal connection logic

## How to test the application

1. Start the stack:

```bash
docker compose up --build
```

2. Open `http://localhost:3000`.
3. Click a challenge.
4. Confirm the live terminal panel appears on the right side.
5. Verify the terminal connects and accepts commands.

## Troubleshooting

### Docker errors

- If Docker does not start, ensure Docker Desktop or Docker Engine is installed and running.
- If you see permission or socket errors, make sure the Docker socket is available and that Docker has permission to bind ports.
- On Windows, use Docker Desktop and enable WSL 2 support if needed.

### Port conflicts

If a port is already in use, stop the conflicting process or change the port mapping in `docker-compose.yml`.

- `3000` → frontend
- `8081` → backend API
- `5433` → PostgreSQL

### Backend startup issues

If the backend cannot start, inspect service logs:

```bash
docker compose logs cl_api
```

If the frontend cannot connect to the backend, verify:

```bash
curl http://localhost:8081/health
```

### `.env` and sensitive data

This `.env` file is included for this demonstration only. It currently does not contain highly sensitive secrets, but for any real deployment you should:

- rotate `JWT_SECRET`
- change database passwords
- remove `.env` from version control if needed
- use secure secret management instead

## Review notes

- This project is a prototype, not a production system.
- It is designed for easy review and quick evaluation by a senior reviewer.
- The current design keeps the frontend and backend together so anyone can clone, build, and run the POC quickly.
- The repository includes a detailed README and Docker Compose configuration for reproducibility.

## Optional commands

Stop the stack:

```bash
docker compose down
```

Rebuild only changed services:

```bash
docker compose up --build api frontend
```

View running containers:

```bash
docker compose ps
```

Remove stopped containers and volumes:

```bash
docker compose down -v
```
