package container

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	dockerclient "github.com/docker/docker/client"

	"challengelabs/backend/config"
	"challengelabs/backend/pkg/logger"
)

// Manager wraps the Docker client and Docker-specific config for container lifecycle management.
type Manager struct {
	client *dockerclient.Client
	cfg    *config.DockerConfig
}

// NewManager creates a Docker client, verifies connectivity, and returns a Manager.
func NewManager(cfg *config.DockerConfig) (*Manager, error) {
	opts := []dockerclient.Opt{
		dockerclient.FromEnv,
		dockerclient.WithAPIVersionNegotiation(),
	}
	if cfg.Host != "" && cfg.Host != "unix:///var/run/docker.sock" {
		opts = append(opts, dockerclient.WithHost(cfg.Host))
	}

	cli, err := dockerclient.NewClientWithOpts(opts...)
	if err != nil {
		return nil, fmt.Errorf("docker client: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err = cli.Ping(ctx); err != nil {
		return nil, fmt.Errorf("docker ping: %w", err)
	}

	logger.Info("Docker connected", "host", cfg.Host)
	return &Manager{client: cli, cfg: cfg}, nil
}

// CreateOptions holds the parameters needed to spin up a challenge container.
type CreateOptions struct {
	Image       string
	SessionKey  string
	UserID      uint
	ChallengeID uint
}

// CreateResult holds the output from a successful container creation.
type CreateResult struct {
	ContainerID string
	IP          string
}

// Create pulls the image if needed, then starts a sandboxed container for the session.
func (m *Manager) Create(ctx context.Context, opts CreateOptions) (*CreateResult, error) {
	if err := m.ensureImage(ctx, opts.Image); err != nil {
		return nil, fmt.Errorf("ensure image: %w", err)
	}

	memBytes := m.cfg.MemoryLimitMB * 1024 * 1024
	pidsLimit := int64(256)

	hostCfg := &container.HostConfig{
		Resources: container.Resources{
			Memory:    memBytes,
			CPUQuota:  m.cfg.CPUQuota,
			PidsLimit: &pidsLimit,
		},
		NetworkMode: "bridge",
		CapDrop:     []string{"ALL"},
		CapAdd:      []string{"CHOWN", "SETUID", "SETGID", "NET_BIND_SERVICE"},
		SecurityOpt: []string{"no-new-privileges:true"},
		AutoRemove:  false,
	}

	containerCfg := &container.Config{
		Image:        opts.Image,
		Tty:          true,
		OpenStdin:    true,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Env: []string{
			fmt.Sprintf("SESSION_KEY=%s", opts.SessionKey),
			"TERM=xterm-256color",
		},
		Labels: map[string]string{
			"challengelab.session":   opts.SessionKey,
			"challengelab.user_id":   fmt.Sprintf("%d", opts.UserID),
			"challengelab.challenge": fmt.Sprintf("%d", opts.ChallengeID),
			"challengelab.managed":   "true",
		},
	}

	resp, err := m.client.ContainerCreate(
		ctx, containerCfg, hostCfg, &network.NetworkingConfig{}, nil,
		fmt.Sprintf("challengelab-%s", opts.SessionKey[:12]),
	)
	if err != nil {
		return nil, fmt.Errorf("container create: %w", err)
	}

	if err = m.client.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		_ = m.client.ContainerRemove(context.Background(), resp.ID,
			container.RemoveOptions{Force: true})
		return nil, fmt.Errorf("container start: %w", err)
	}

	ip, err := m.getContainerIP(ctx, resp.ID)
	if err != nil {
		logger.Warn("could not get container IP", "id", resp.ID[:12], "err", err)
	}

	logger.Info("Container started",
		"id", resp.ID[:12],
		"image", opts.Image,
		"session", opts.SessionKey[:8],
		"ip", ip,
	)
	return &CreateResult{ContainerID: resp.ID, IP: ip}, nil
}

// ExecAttach opens an interactive shell session (bash or sh) inside the container.
func (m *Manager) ExecAttach(ctx context.Context, containerID string) (types.HijackedResponse, string, error) {
	exec, err := m.client.ContainerExecCreate(ctx, containerID, types.ExecConfig{
		Cmd:          []string{"/bin/sh"},
		Tty:          true,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Env:          []string{"TERM=xterm-256color"},
	})
	if err != nil {
		return types.HijackedResponse{}, "", fmt.Errorf("could not create exec: %w", err)
	}

	hr, err := m.client.ContainerExecAttach(ctx, exec.ID, types.ExecStartCheck{Tty: true})
	if err != nil {
		return types.HijackedResponse{}, "", fmt.Errorf("could not attach exec: %w", err)
	}
	return hr, exec.ID, nil
}

// ResizeExec resizes the PTY of a running exec session.
func (m *Manager) ResizeExec(ctx context.Context, execID string, rows, cols uint) error {
	return m.client.ContainerExecResize(ctx, execID, container.ResizeOptions{
		Height: rows,
		Width:  cols,
	})
}

// Stop gracefully stops a container then force-removes it.
func (m *Manager) Stop(ctx context.Context, containerID string) error {
	timeout := 10
	if err := m.client.ContainerStop(ctx, containerID, container.StopOptions{Timeout: &timeout}); err != nil {
		logger.Warn("container stop error (forcing remove)", "id", containerID[:12], "err", err)
	}
	return m.client.ContainerRemove(ctx, containerID, container.RemoveOptions{Force: true})
}

// IsRunning returns true if the given container is currently running.
func (m *Manager) IsRunning(ctx context.Context, containerID string) (bool, error) {
	info, err := m.client.ContainerInspect(ctx, containerID)
	if err != nil {
		if dockerclient.IsErrNotFound(err) {
			return false, nil
		}
		return false, err
	}
	return info.State.Running, nil
}

// Stats returns a single-shot snapshot of container resource usage.
func (m *Manager) Stats(ctx context.Context, containerID string) (*types.StatsJSON, error) {
	resp, err := m.client.ContainerStats(ctx, containerID, false)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var stats types.StatsJSON
	if err = json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return nil, err
	}
	return &stats, nil
}

// ensureImage pulls the image from the registry if it is not already present locally.
func (m *Manager) ensureImage(ctx context.Context, image string) error {
	_, _, err := m.client.ImageInspectWithRaw(ctx, image)
	if err == nil {
		return nil
	}
	if !dockerclient.IsErrNotFound(err) {
		return err
	}

	logger.Info("Pulling Docker image", "image", image)
	reader, err := m.client.ImagePull(ctx, image, types.ImagePullOptions{})
	if err != nil {
		return fmt.Errorf("image pull: %w", err)
	}
	defer reader.Close()
	_, _ = io.Copy(io.Discard, reader)

	logger.Info("Image pulled", "image", image)
	return nil
}

// getContainerIP returns the first non-empty IP address found in the container's networks.
func (m *Manager) getContainerIP(ctx context.Context, containerID string) (string, error) {
	info, err := m.client.ContainerInspect(ctx, containerID)
	if err != nil {
		return "", err
	}
	for _, n := range info.NetworkSettings.Networks {
		if n.IPAddress != "" {
			return n.IPAddress, nil
		}
	}
	return "", nil
}
