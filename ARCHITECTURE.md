# ChallengeLabs Backend — Architecture & Setup Guide

## What This Project Is

A **CTF (Capture The Flag) platform backend** written in Go.

- Users browse cybersecurity **challenges**
- Click **Start** → a sandboxed **Docker container** spins up just for them
- They get a live **WebSocket terminal** in the browser connected to that container
- They find a hidden `flag{...}` string and **submit it** to earn points
- The **scheduler** auto-kills containers when they expire or go idle

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (React Frontend)                        │
│                                                                         │
│   REST calls (fetch)              WebSocket (ws://)                     │
│   Authorization: Bearer <JWT>     ?token=<JWT>  (browsers can't set     │
│                                                  WS headers)            │
└──────────────┬──────────────────────────────┬──────────────────────────┘
               │ HTTP/1.1                      │ WS Upgrade
               ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    GIN HTTP ROUTER  :8080                               │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ Rate Limiter │  │ Auth (JWT)   │  │ CORS         │                  │
│  │ 10/min auth  │  │ middleware   │  │ middleware   │                  │
│  │ 120/min api  │  │             │  │             │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                         HTTP HANDLERS                            │  │
│  │                                                                  │  │
│  │  AuthHandler      ChallengeHandler    CategoryHandler            │  │
│  │  /auth/register   /challenges         /categories               │  │
│  │  /auth/login      /challenges/:id     (admin CRUD)              │  │
│  │  /auth/me         /challenges/:id/submit                        │  │
│  │                   /leaderboard                                  │  │
│  │                                                                  │  │
│  │  SessionHandler               AdminHandler                      │  │
│  │  /sessions/*/start            /admin/stats                      │  │
│  │  /sessions/:key/status        /admin/users                      │  │
│  │  /sessions/:key/stats         /admin/users/:id/role             │  │
│  │  /sessions/:key (DELETE)                                        │  │
│  │                                                                  │  │
│  │  TerminalHandler              DevHandler (ENV=development only)  │  │
│  │  /ws/terminal/:sessionKey     /dev/sessions/start               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────┐   ┌─────────────────────────────────────┐ │
│  │   TERMINAL BRIDGE       │   │         WS HUB                      │ │
│  │                         │   │                                     │ │
│  │  3 goroutines per conn: │   │  map[sessionKey]*Client             │ │
│  │  A: container→browser   │   │  Scheduler uses Hub.Broadcast()     │ │
│  │  B: expiry ticker (5s)  │   │  to push expiry warnings to all     │ │
│  │  main: browser→container│   │  connected terminals                │ │
│  └────────────┬────────────┘   └─────────────────────────────────────┘ │
│               │                                                         │
│  ┌────────────▼────────────────────────────────────────────────────┐   │
│  │                    BACKGROUND SCHEDULER (cron)                   │   │
│  │                                                                  │   │
│  │  Every 30s  → reap sessions whose TTL expired                   │   │
│  │  Every 2min → reap idle sessions (no activity)                  │   │
│  │  Every 30s  → broadcast expiry countdown to WS clients          │   │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬──────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐
   │  PostgreSQL  │ │ session.Store│ │      DOCKER DAEMON           │
   │              │ │  interface   │ │                              │
   │  Users       │ │              │ │  Manager.Create()            │
   │  Categories  │ │  postgres    │ │  → pulls image if missing    │
   │  Challenges  │ │  mode:       │ │  → starts container          │
   │  Tasks       │ │  SessionRepo │ │  → sandboxed (memory+cpu cap)│
   │  Sessions    │ │  (GORM)      │ │                              │
   │  UserProgress│ │              │ │  Manager.ExecAttach()        │
   └──────────────┘ │  memory mode:│ │  → opens /bin/sh PTY inside  │
                    │  MemoryStore │ │    the running container      │
                    │  (in-process)│ │                              │
                    └──────────────┘ │  Manager.Stop()              │
                                     │  → graceful stop + rm        │
                                     └──────────────────────────────┘
```

---

## Data Model Relationships

```
User ──────────────────────────────────────────────────────┐
 │                                                          │
 │ has many Sessions                              has many UserProgress
 │                                                          │
 ▼                                                          ▼
Session ──────────────────── Challenge ──────── UserProgress
 │ belongs to User             │ belongs to Category
 │ belongs to Challenge        │ has many Tasks
 │ has ContainerID             │ has bcrypt-hashed Flag
 │ has SessionKey (unique)     │
 │ has Status                  │
 │   booting → active          │
 │   → terminating → expired   │
```

---

## Request / Response Flow

### 1. User Starts a Challenge

```
POST /api/v1/sessions/challenges/3/start
Authorization: Bearer <jwt>

   SessionHandler.Start()
      ├── Validate challenge exists + published
      ├── Check for existing active session (reuse if container still running)
      ├── Generate 64-char hex session key
      ├── store.Create(session{status:booting})
      ├── containerMgr.Create(image, sessionKey, userID, challengeID)
      │      ├── Pull Docker image (if not cached)
      │      ├── ContainerCreate (with memory+cpu limits)
      │      └── ContainerStart
      ├── store.Update(session{status:active, containerID, containerIP})
      └── return {session_key, expires_at, remaining}
```

### 2. Browser Opens Terminal

```
GET /ws/terminal/<sessionKey>?token=<jwt>

   AuthRequired middleware validates JWT
   TerminalHandler.Connect()
      ├── store.FindByKey(sessionKey) → validate ownership
      ├── WS upgrade (gorilla/websocket)
      ├── containerMgr.ExecAttach(containerID)
      │      └── opens /bin/sh PTY inside container
      ├── hub.Register(sessionKey, client)
      ├── go client.WritePump()          ← drains send channel → WS
      └── bridge.Run(ctx, config)        ← BLOCKS until session ends
             ├── goroutine A: container stdout → WS {"type":"output"}
             ├── goroutine B: expiry ticker every 5s
             └── main loop: WS frames → container stdin
```

### 3. Flag Submission

```
POST /api/v1/challenges/3/submit
{"flag": "flag{the_flag_here}"}

   ChallengeHandler.SubmitFlag()
      ├── resolve challenge by ID or slug
      ├── bcrypt.CompareHashAndPassword(challenge.Flag, submitted)
      ├── if correct → progressRepo.Upsert({completed:true, points})
      └── return {correct:true, points:100}
```

---

## How Everything Links Together — Step by Step

### Mode 1: Memory Mode (Zero Dependencies)
> No Docker DB, no PostgreSQL. Only Docker daemon needed for containers.

```
.env  →  STORE=memory
           │
           ▼
    main.go switch "memory"
           │
           ├── store = session.NewMemoryStore()    (in-process map)
           ├── userRepo      = nil  (auth routes disabled)
           ├── challengeRepo = nil  (challenge routes disabled)
           └── only terminal engine works
```

**What works:** Dev terminal at `http://localhost:8080/terminal`  
**What doesn't:** Login, challenges, leaderboard (need postgres)

---

### Mode 2: Full Postgres Mode
> Full platform. Requires PostgreSQL + Docker daemon.

```
.env  →  STORE=postgres
           │
           ▼
    main.go switch "postgres"
           │
           ├── repository.InitDB(dsn)
           │      └── GORM AutoMigrate (creates all tables)
           │
           ├── userRepo      = NewUserRepository(db)
           ├── challengeRepo = NewChallengeRepository(db)
           ├── categoryRepo  = NewCategoryRepository(db)
           ├── progressRepo  = NewProgressRepository(db)
           ├── sessionRepo   = NewSessionRepository(db)
           └── store         = sessionRepo     ← implements session.Store
```

---

## WebSocket Message Protocol

```
CLIENT → SERVER                     SERVER → CLIENT
─────────────────────────────────   ──────────────────────────────────
{ "type": "input",                  { "type": "output",
  "data": "ls -la\n" }               "data": "total 48\ndrwx..." }

{ "type": "resize",                 { "type": "status",
  "cols": 220, "rows": 50 }           "status": "active",
                                       "remaining": 3540 }

{ "type": "ping" }                  { "type": "expiry",
                                       "remaining": 300 }

                                    { "type": "pong" }

                                    { "type": "error",
                                       "error": "container stopped" }
```

---

## Container Security Model

Every challenge container is sandboxed:

```
HostConfig {
  Memory:    512 MiB          CONTAINER_MEMORY_LIMIT_MB
  CPUQuota:  50000            50% of 1 CPU core
  PidsLimit: 256              blocks fork bombs
  NetworkMode: "bridge"       isolated from host network
  CapDrop:  ["ALL"]           all Linux capabilities dropped
  CapAdd:   ["CHOWN","SETUID","SETGID","NET_BIND_SERVICE"]
  SecurityOpt: ["no-new-privileges:true"]
}
```

Labels on every container:
```
challengelab.session   = <64-char hex key>
challengelab.user_id   = <userID>
challengelab.challenge = <challengeID>
challengelab.managed   = true
```

---

## Session Lifecycle

```
              POST /sessions/*/start
                      │
                      ▼
                  [booting]
                      │
          ┌───────────┴───────────┐
          │ container started     │ Docker error
          ▼                       ▼
       [active]               [error]
          │
    ┌─────┴──────────────────────────┐
    │ user DELETE    TTL expires     idle timeout
    ▼                ▼               ▼
[terminating]    [expired]        [expired]
    │
    ▼
[expired]   ← container stopped + removed
```

---

## All REST Endpoints

### Public
```
GET  /health                          Server health + active session count
```

### Auth (10 req/min rate limit)
```
POST /api/v1/auth/register            Create account → JWT
POST /api/v1/auth/login               Login → JWT
```

### Authenticated (120 req/min, JWT required)
```
GET    /api/v1/auth/me                My profile
PUT    /api/v1/auth/password          Change password
PATCH  /api/v1/auth/me                Update username / avatar

GET    /api/v1/categories             List all categories

GET    /api/v1/challenges             List published challenges
GET    /api/v1/challenges/:id         Get challenge + my progress
POST   /api/v1/challenges/:id/submit  Submit flag {"flag":"..."}

GET    /api/v1/leaderboard?limit=50   Top-N users by points

POST   /api/v1/sessions/challenges/:id/start   Start container
GET    /api/v1/sessions                        My active sessions
GET    /api/v1/sessions/:key/status            Status + is container live
GET    /api/v1/sessions/:key/stats             CPU% + RAM usage
DELETE /api/v1/sessions/:key                   Terminate session
GET    /api/v1/sessions/challenges/:id/reconnect  Reconnect to existing
```

### Admin only (role=admin)
```
GET    /api/v1/admin/stats              Active sessions + user/challenge counts
GET    /api/v1/admin/users?page=&size=  Paginated user list
GET    /api/v1/admin/users/:id          Get user
PATCH  /api/v1/admin/users/:id/role     Set role {role:"admin"/"user"}
POST   /api/v1/admin/challenges         Create challenge
PUT    /api/v1/admin/challenges/:id     Update challenge
DELETE /api/v1/admin/challenges/:id     Soft-delete challenge
POST   /api/v1/admin/categories         Create category
PUT    /api/v1/admin/categories/:id     Update category
DELETE /api/v1/admin/categories/:id     Delete category
```

### WebSocket
```
GET /ws/terminal/:sessionKey?token=<jwt>       Production terminal
GET /ws/dev/terminal/:sessionKey               Dev terminal (no JWT)
```

---

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `JWT_SECRET` | — | **YES** | Must be set. Long random string |
| `ENV` | `development` | no | `development` or `production` |
| `SERVER_PORT` | `8080` | no | HTTP listen port |
| `STORE` | `postgres` | no | `memory` or `postgres` |
| `DB_HOST` | `localhost` | postgres only | PostgreSQL hostname |
| `DB_PORT` | `5432` | postgres only | PostgreSQL port |
| `DB_USER` | `postgres` | postgres only | DB username |
| `DB_PASSWORD` | `postgres` | postgres only | DB password |
| `DB_NAME` | `challengelabs` | postgres only | DB name |
| `DB_SSLMODE` | `disable` | no | `disable`/`require`/`verify-full` |
| `JWT_EXPIRY_HOURS` | `24` | no | Token lifetime |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | no | Docker socket |
| `CONTAINER_MAX_LIFETIME_MINUTES` | `60` | no | Hard TTL per session |
| `CONTAINER_IDLE_TIMEOUT_MINUTES` | `15` | no | Idle reap timeout |
| `CONTAINER_MEMORY_LIMIT_MB` | `512` | no | RAM cap per container |
| `CONTAINER_CPU_QUOTA` | `50000` | no | CPU quota (50% of 1 core) |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | no | CORS origins (comma-sep) |

---

## Setup Instructions

### Prerequisites
- Go 1.23+
- Docker Desktop (running)
- PostgreSQL 16 (or use Docker)

---

### Option A — Memory Mode (Fastest, no DB)

```bash
# 1. Clone / open project
cd challengelabs-backend

# 2. Set JWT secret in .env
#    Edit .env → JWT_SECRET=my-super-secret-key-here

# 3. Make sure STORE=memory in .env (already set by default)

# 4. Run
go run ./cmd/server/...

# 5. Open dev terminal UI
#    http://localhost:8080/terminal
#    (starts an alpine container, gives you a shell)
```

**Limitation:** No login, no challenges, no leaderboard — only raw terminal works.

---

### Option B — Postgres via Docker + Go server locally (Recommended for dev)

```bash
# 1. Set JWT secret in .env
#    JWT_SECRET=my-super-secret-key-here

# 2. Change STORE to postgres in .env
#    STORE=postgres

# 3. Start ONLY the PostgreSQL container (not the API)
docker compose up postgres -d

#    Postgres is now running on localhost:5432
#    DB: challengelabs, User: postgres, Pass: postgres

# 4. Run migrations + seed data
go run ./cmd/seed/...
#    Creates: admin@challengelabs.local / admin1234
#    Creates: 6 categories + 4 sample challenges

# 5. Run the API server locally (connects to DB at localhost:5432)
go run ./cmd/server/...

# 6. Test it
curl http://localhost:8080/health

curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@challengelabs.local","password":"admin1234"}'
```

---

### Option C — Full Docker Stack (API + DB, everything containerised)

```bash
# 1. Set JWT secret in .env
#    JWT_SECRET=my-super-secret-key-here

# 2. Build and start everything
docker compose up --build

#    Docker builds the Go binary inside a container
#    Starts postgres first (waits for healthcheck)
#    Starts API container (connects to postgres via hostname "postgres")
#    API is accessible on localhost:8080

# 3. Seed data (run from host, connecting to localhost:5432)
go run ./cmd/seed/...

# 4. Verify
curl http://localhost:8080/health
```

**Note:** In this mode `DB_HOST=postgres` inside docker-compose.yml (the postgres container's service name is the hostname).

---

### How DB_HOST Works Between Modes

```
Option B (local Go + Docker postgres):
  Go binary runs on HOST machine
  PostgreSQL runs INSIDE Docker
  Docker maps container port 5432 → host port 5432
  .env → DB_HOST=localhost  ✓

Option C (full Docker stack):
  Go binary runs INSIDE Docker (api container)
  PostgreSQL runs INSIDE Docker (postgres container)
  Both on same Docker network "challengelabs_default"
  docker-compose.yml → DB_HOST=postgres  (container name = hostname) ✓
```

---

### Stopping Everything

```bash
# Stop Docker containers
docker compose down

# Stop and DELETE database volume (fresh start)
docker compose down -v
```

---

## Makefile Commands

```bash
make run          # go run ./cmd/server/... (local)
make seed         # go run ./cmd/seed/... (seed DB)
make build        # compile binary to ./bin/server
make tidy         # go mod tidy + verify
make lint         # golangci-lint (if installed)
make docker-up    # docker compose up -d (postgres only)
make docker-down  # docker compose down
make docker-stack # docker compose up --build (full stack)
```
