package routes

import (
	"encoding/json"
	"net/http"
	"text/template"
	"time"

	"aq-server/internal/handlers"
	"aq-server/internal/metrics"
	"github.com/pion/logging"
)

// RouteHandlers holds the dependencies for route setup
type RouteHandlers struct {
	Logger            logging.LeveledLogger
	IndexTemplate     *template.Template
	DispatchKeyFrame  func()
	GetPeerCount      func() int
}

// HealthResponse represents the response for the health check endpoint
type HealthResponse struct {
	Status    string `json:"status"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
	Peers     int    `json:"peers"`
}

// Setup registers all HTTP routes
func Setup(routeHandlers *RouteHandlers) error {
	// health check handler
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		response := HealthResponse{
			Status:    "healthy",
			Message:   "Server is running",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Peers:     routeHandlers.GetPeerCount(),
		}
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(response); err != nil {
			routeHandlers.Logger.Errorf("Failed to encode health response: %v", err)
		}
	})

	// metrics endpoint
	http.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		m := metrics.Get()
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(m); err != nil {
			routeHandlers.Logger.Errorf("Failed to encode metrics response: %v", err)
		}
	})

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
