package config

import (
	"flag"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds application configuration
type Config struct {
	Addr              string
	LogLevel          string
	Env               string
	KeepalivePingInt  time.Duration // Keepalive ping interval
	KeepalivePongWait time.Duration // Time to wait for pong
	WriteDeadline     time.Duration // Write operation timeout
}

// Load parses and returns the application configuration
// Priority: command-line flags > environment variables > .env file > defaults
func Load() *Config {
	// Load .env file if it exists
	loadEnvFile(".env")

	addr := flag.String("addr", getEnv("SERVER_ADDR", ":8080"), "http service address")
	logLevel := flag.String("log-level", getEnv("LOG_LEVEL", "info"), "log level (debug, info, warn, error)")
	env := flag.String("env", getEnv("ENVIRONMENT", "development"), "environment (development, staging, production)")
	pingInt := flag.String("keepalive-ping", getEnv("KEEPALIVE_PING", "30"), "keepalive ping interval in seconds")
	pongWait := flag.String("keepalive-pong", getEnv("KEEPALIVE_PONG", "10"), "keepalive pong wait time in seconds")
	writeDeadline := flag.String("write-deadline", getEnv("WRITE_DEADLINE", "5"), "write operation timeout in seconds")
	flag.Parse()

	// Parse durations
	pingIntSecs, _ := strconv.ParseInt(*pingInt, 10, 64)
	pongWaitSecs, _ := strconv.ParseInt(*pongWait, 10, 64)
	writeDeadlineSecs, _ := strconv.ParseInt(*writeDeadline, 10, 64)

	return &Config{
		Addr:              *addr,
		LogLevel:          strings.ToLower(*logLevel),
		Env:               strings.ToLower(*env),
		KeepalivePingInt:  time.Duration(pingIntSecs) * time.Second,
		KeepalivePongWait: time.Duration(pongWaitSecs) * time.Second,
		WriteDeadline:     time.Duration(writeDeadlineSecs) * time.Second * 2, // Doubled to prevent premature timeout
	}
}

// getEnv gets an environment variable with a default fallback
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// loadEnvFile loads environment variables from a .env file
func loadEnvFile(filename string) {
	file, err := os.Open(filename)
	if err != nil {
		return // .env file is optional
	}
	defer file.Close()

	lines := make([]string, 0)
	buf := make([]byte, 4096)
	for {
		n, err := file.Read(buf)
		if n > 0 {
			lines = append(lines, string(buf[:n]))
		}
		if err != nil {
			break
		}
	}

	content := strings.Join(lines, "")
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		// Remove quotes if present
		value = strings.Trim(value, "\"'")

		if key != "" {
			os.Setenv(key, value)
		}
	}
}
