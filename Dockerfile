# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

# Install build dependencies (gcc required by cgo-free builds; git for module cache)
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Copy module files first (layer-cached; only re-runs when go.mod/go.sum change)
COPY go.mod go.sum ./
RUN go mod download

# Copy the full source tree
COPY . .

# Build a statically linked binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /app/bin/server ./cmd/server/...

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM alpine:3.20

# ca-certificates: needed for HTTPS calls (Docker Hub pulls from container mgr)
# tzdata: consistent UTC timestamps in logs
RUN apk add --no-cache ca-certificates tzdata

# Runtime dependencies
WORKDIR /app

# Copy the compiled binary from the builder stage
COPY --from=builder /app/bin/server ./server

RUN chmod 500 ./server

# Run as root so the API can access the mounted Docker socket in development.
USER root

EXPOSE 8080

ENTRYPOINT ["./server"]
