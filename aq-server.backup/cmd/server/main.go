// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

//go:build !js
// +build !js

// sfu-ws is a many-to-many websocket based SFU
package main

import (
	"log"

	"aq-server/internal/app"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file (if it exists)
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️  No .env file found, using environment variables")
	}
	
	application, err := app.New()
	if err != nil {
		panic(err)
	}

	if err := application.Run(); err != nil {
		panic(err)
	}
}


