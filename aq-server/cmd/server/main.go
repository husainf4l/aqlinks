// SPDX-FileCopyrightText: 2023 The Pion community <https://pion.ly>
// SPDX-License-Identifier: MIT

//go:build !js
// +build !js

// sfu-ws is a many-to-many websocket based SFU
package main

import (
	"net/http"
	"os"
	"sync"
	"text/template"

	"aq-server/internal/config"
	"aq-server/internal/handlers"
	"aq-server/internal/routes"
	"aq-server/internal/sfu"
	"aq-server/internal/types"
	"github.com/gorilla/websocket"
	"github.com/pion/logging"
	"github.com/pion/webrtc/v4"
)

// nolint
var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	indexTemplate = &template.Template{}

	// lock for peerConnections and trackLocals
	listLock        sync.RWMutex
	peerConnections []types.PeerConnectionState
	trackLocals     map[string]*webrtc.TrackLocalStaticRTP

	log = logging.NewDefaultLoggerFactory().NewLogger("sfu-ws")
)

// Type aliases for backward compatibility with lowercase names
type peerConnectionState = types.PeerConnectionState
type websocketMessage = types.WebsocketMessage
type chatMessage = types.ChatMessage
type threadSafeWriter = types.ThreadSafeWriter

func main() {
	// Load configuration
	cfg := config.Load()

	// Init other state
	trackLocals = map[string]*webrtc.TrackLocalStaticRTP{}

	// Initialize handlers package with context
	handlers.InitContext(&handlers.HandlerContext{
		PeerConnections:       &peerConnections,
		TrackLocals:           &trackLocals,
		AddTrack:              sfu.AddTrack,
		RemoveTrack:           sfu.RemoveTrack,
		SignalPeerConnections: sfu.SignalPeerConnections,
		BroadcastChat:         sfu.BroadcastChat,
	})

	// Initialize SFU package with context
	sfu.InitContext(&sfu.SFUContext{
		PeerConnections: &peerConnections,
		TrackLocals:     &trackLocals,
	})

	// Read index.html from disk into memory, serve whenever anyone requests /
	indexHTML, err := os.ReadFile("index.html")
	if err != nil {
		panic(err)
	}
	indexTemplate = template.Must(template.New("").Parse(string(indexHTML)))

	// Setup routes
	if err = routes.Setup(&routes.RouteHandlers{
		IndexTemplate:    indexTemplate,
		DispatchKeyFrame: sfu.DispatchKeyFrame,
	}); err != nil {
		log.Errorf("Failed to setup routes: %v", err)
		return
	}

	// start HTTP server
	if err = http.ListenAndServe(cfg.Addr, nil); err != nil { //nolint: gosec
		log.Errorf("Failed to start http server: %v", err)
	}
}


