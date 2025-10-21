package routes

import (
	"net/http"
	"text/template"
	"time"

	"aq-server/internal/handlers"
	"github.com/pion/logging"
)

// RouteHandlers holds the dependencies for route setup
type RouteHandlers struct {
	Logger           logging.LeveledLogger
	IndexTemplate    *template.Template
	DispatchKeyFrame func()
}

// Setup registers all HTTP routes
func Setup(routeHandlers *RouteHandlers) error {
	// websocket handler
	http.HandleFunc("/aq_server/websocket", handlers.WebsocketHandler)

	// index.html handler
	http.HandleFunc("/aq_server/", func(w http.ResponseWriter, r *http.Request) {
		// Determine the WebSocket URL based on the request scheme
		scheme := "ws://"
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			scheme = "wss://"
		}
		wsURL := scheme + r.Host + "/aq_server/websocket"

		if err := routeHandlers.IndexTemplate.Execute(w, wsURL); err != nil {
			routeHandlers.Logger.Errorf("Failed to parse index template: %v", err)
		}
	})

	// request a keyframe every 3 seconds
	go func() {
		for range time.NewTicker(time.Second * 3).C {
			routeHandlers.DispatchKeyFrame()
		}
	}()

	return nil
}
