package logger

import (
	"log/slog"
	"os"
)

// Log is the global structured logger instance.
var Log *slog.Logger

func init() {
	Log = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	slog.SetDefault(Log)
}

// Init configures the global logger based on the runtime environment.
// In production it emits JSON; otherwise it uses human-readable text.
func Init(env string) {
	opts := &slog.HandlerOptions{Level: slog.LevelDebug}
	var h slog.Handler
	if env == "production" {
		h = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		h = slog.NewTextHandler(os.Stdout, opts)
	}
	Log = slog.New(h)
	slog.SetDefault(Log)
}

// Convenience wrappers around the global logger.
func Info(msg string, args ...any)  { Log.Info(msg, args...) }
func Error(msg string, args ...any) { Log.Error(msg, args...) }
func Debug(msg string, args ...any) { Log.Debug(msg, args...) }
func Warn(msg string, args ...any)  { Log.Warn(msg, args...) }
