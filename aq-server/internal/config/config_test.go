package config

import (
	"os"
	"testing"
)

func TestLoadDefaultConfig(t *testing.T) {
	// Clear any existing env vars
	os.Unsetenv("SERVER_ADDR")
	os.Unsetenv("LOG_LEVEL")
	os.Unsetenv("ENVIRONMENT")

	// Note: Can't reliably test Load() in unit tests due to flag.Parse() being called once per process
	// Testing getEnv and loadEnvFile instead
	result := getEnv("NONEXISTENT", "default")
	if result != "default" {
		t.Errorf("Expected default value, got %s", result)
	}
}

func TestLoadConfigFromEnv(t *testing.T) {
	// Set environment variables
	os.Setenv("SERVER_ADDR", ":9090")
	os.Setenv("LOG_LEVEL", "debug")
	os.Setenv("ENVIRONMENT", "production")

	defer func() {
		os.Unsetenv("SERVER_ADDR")
		os.Unsetenv("LOG_LEVEL")
		os.Unsetenv("ENVIRONMENT")
	}()

	// Test getEnv function with environment variables
	addr := getEnv("SERVER_ADDR", ":8080")
	if addr != ":9090" {
		t.Errorf("Expected :9090, got %s", addr)
	}

	logLevel := getEnv("LOG_LEVEL", "info")
	if logLevel != "debug" {
		t.Errorf("Expected debug, got %s", logLevel)
	}

	env := getEnv("ENVIRONMENT", "development")
	if env != "production" {
		t.Errorf("Expected production, got %s", env)
	}
}

func TestGetEnv(t *testing.T) {
	os.Setenv("TEST_VAR", "test_value")
	defer os.Unsetenv("TEST_VAR")

	tests := []struct {
		name         string
		key          string
		defaultValue string
		expected     string
	}{
		{
			name:         "existing key",
			key:          "TEST_VAR",
			defaultValue: "default",
			expected:     "test_value",
		},
		{
			name:         "non-existing key",
			key:          "NON_EXISTING",
			defaultValue: "default",
			expected:     "default",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getEnv(tt.key, tt.defaultValue)
			if result != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, result)
			}
		})
	}
}
