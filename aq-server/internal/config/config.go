package config

import (
	"flag"
	"os"
	"strings"
)

// Config holds application configuration
type Config struct {
	Addr     string
	LogLevel string
	Env      string
}

// Load parses and returns the application configuration
// Priority: command-line flags > environment variables > .env file > defaults
func Load() *Config {
	// Load .env file if it exists
	loadEnvFile(".env")

	addr := flag.String("addr", getEnv("SERVER_ADDR", ":8080"), "http service address")
	logLevel := flag.String("log-level", getEnv("LOG_LEVEL", "info"), "log level (debug, info, warn, error)")
	env := flag.String("env", getEnv("ENVIRONMENT", "development"), "environment (development, staging, production)")
	flag.Parse()

	return &Config{
		Addr:     *addr,
		LogLevel: strings.ToLower(*logLevel),
		Env:      strings.ToLower(*env),
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
