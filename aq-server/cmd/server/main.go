// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

//go:build !js
// +build !js

// sfu-ws is a many-to-many websocket based SFU
package main

import (
	"aq-server/internal/app"
)

func main() {
	application, err := app.New()
	if err != nil {
		panic(err)
	}

	if err := application.Run(); err != nil {
		panic(err)
	}
}


