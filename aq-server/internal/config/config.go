package config

import (
	"flag"
)

// Config holds application configuration
type Config struct {
	Addr string
}

// Load parses and returns the application configuration
func Load() *Config {
	addr := flag.String("addr", ":8080", "http service address")
	flag.Parse()

	return &Config{
		Addr: *addr,
	}
}
