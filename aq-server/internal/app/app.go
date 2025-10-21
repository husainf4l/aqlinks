package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"text/template"
	"time"

	"aq-server/internal/api"
	"aq-server/internal/config"
	"aq-server/internal/database"
	"aq-server/internal/handlers"
	"aq-server/internal/keepalive"
	"aq-server/internal/room"
	"aq-server/internal/sfu"
	"aq-server/internal/types"
	"github.com/gorilla/websocket"
	"github.com/pion/logging"
	"github.com/pion/webrtc/v4"
	"github.com/urfave/negroni/v3"
)

// App holds the application state
type App struct {
	cfg             *config.Config
	httpServer      *http.Server
	serveMux        *http.ServeMux
	upgrader        websocket.Upgrader
	indexTemplate   *template.Template
	listLock        sync.RWMutex
	peerConnections []types.PeerConnectionState
	trackLocals     map[string]*webrtc.TrackLocalStaticRTP
	log             logging.LeveledLogger
	roomManager     *room.RoomManager
}

// New creates and initializes a new App
func New() (*App, error) {
	cfg := config.Load()
	
	// Create logger first for database initialization
	log := createLogger(cfg)
	
	// Initialize database connection
	if err := database.Init(log); err != nil {
		return nil, err
	}
	
	// Create HTTP server and mux
	mux := http.NewServeMux()
	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	
	app := &App{
		cfg:        cfg,
		httpServer: httpServer,
		serveMux:   mux,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		indexTemplate: &template.Template{},
		trackLocals:   make(map[string]*webrtc.TrackLocalStaticRTP),
		log:           log,
		roomManager:   room.NewRoomManager(),
	}

	// Read index.html from disk into memory
	indexHTML, err := os.ReadFile("index.html")
	if err != nil {
		return nil, err
	}
	app.indexTemplate = template.Must(template.New("").Parse(string(indexHTML)))

	// Initialize handlers package with context
	keepaliveCfg := keepalive.Config{
		PingInterval:  app.cfg.KeepalivePingInt,
		PongWaitTime:  app.cfg.KeepalivePongWait,
		WriteDeadline: app.cfg.WriteDeadline,
	}
	
	handlers.InitContext(&handlers.HandlerContext{
		Upgrader:              app.upgrader,
		Logger:                app.log,
		PeerConnections:       &app.peerConnections,
		TrackLocals:           &app.trackLocals,
		AddTrack:              sfu.AddTrack,
		RemoveTrack:           sfu.RemoveTrack,
		SignalPeerConnections: sfu.SignalPeerConnections,
		BroadcastChat:         sfu.BroadcastChat,
		KeepaliveConfig:       keepaliveCfg,
		RoomManager:           app.roomManager,
	})

	// Initialize SFU package with context
	sfu.InitContext(&sfu.SFUContext{
		Logger:          app.log,
		PeerConnections: &app.peerConnections,
		TrackLocals:     &app.trackLocals,
		RoomManager:     app.roomManager,
	})

	return app, nil
}

// Run starts the HTTP server with all routes (REST API, WebSocket, Static files)
func (a *App) Run() error {
	// Create a negroni middleware stack
	n := negroni.New()
	
	// Add logging middleware
	n.Use(negroni.NewLogger())
	
	// Add recovery middleware
	n.Use(negroni.NewRecovery())
	
	// Setup REST API routes with net/http
	if err := api.SetupRoutes(a.serveMux); err != nil {
		a.log.Errorf("Failed to setup API routes: %v", err)
		return err
	}

	// Register route handlers for WebSocket and static files
	a.serveMux.HandleFunc("/", a.indexHandler)
	a.serveMux.HandleFunc("/aq_server/", a.indexHandler)
	a.serveMux.HandleFunc("/aq_server/ws", a.websocketHandler)
	a.serveMux.HandleFunc("/ws", a.websocketHandler)
	a.serveMux.HandleFunc("/health", a.healthHandler)
	a.serveMux.HandleFunc("/metrics", a.metricsHandler)

	// Use the ServeMux as the final handler in negroni
	n.UseHandler(a.serveMux)
	
	// Update server handler to use negroni
	a.httpServer.Handler = n

	// Channel to signal server errors
	serverErrors := make(chan error, 1)

	// Start HTTP server
	go func() {
		a.log.Infof("Starting HTTP server on %s", a.httpServer.Addr)
		serverErrors <- a.httpServer.ListenAndServe()
	}()

	// Setup signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Wait for shutdown signal or server error
	select {
	case sig := <-sigChan:
		a.log.Infof("Received signal: %v, initiating graceful shutdown", sig)
	case err := <-serverErrors:
		if err != nil && err != http.ErrServerClosed {
			a.log.Errorf("Server error: %v", err)
			return err
		}
	}

	// Gracefully shutdown with 10 second timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	a.log.Infof("Closing peer connections...")
	a.shutdown()

	a.log.Infof("Shutting down server...")
	if err := a.httpServer.Shutdown(ctx); err != nil {
		a.log.Errorf("Server shutdown error: %v", err)
		return err
	}

	// Close database connection
	a.log.Infof("Closing database connection...")
	if err := database.Close(); err != nil {
		a.log.Errorf("Database close error: %v", err)
	}

	a.log.Infof("Server shutdown complete")
	return nil
}

// indexHandler serves the HTML UI
func (a *App) indexHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	// Determine the WebSocket URL based on the request scheme
	scheme := "ws://"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "wss://"
	}
	wsURL := scheme + r.Host + "/aq_server/ws"
	
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := a.indexTemplate.Execute(w, wsURL); err != nil {
		a.log.Errorf("Error executing index template: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

// websocketHandler handles WebSocket connections
func (a *App) websocketHandler(w http.ResponseWriter, r *http.Request) {
	handlers.WebsocketHandler(w, r)
}

// healthHandler returns health status
func (a *App) healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	health := map[string]interface{}{
		"status":    "healthy",
		"message":   "Server is running",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"peers":     len(a.peerConnections),
	}
	
	if err := json.NewEncoder(w).Encode(health); err != nil {
		a.log.Errorf("Error encoding health response: %v", err)
	}
}

// metricsHandler returns server metrics
func (a *App) metricsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	metrics := map[string]interface{}{
		"active_connections":        len(a.peerConnections),
		"total_connections_created": len(a.peerConnections),
		"uptime_seconds":            int(time.Since(time.Now()).Seconds()),
		"rooms_active":              0,
		"timestamp":                 time.Now().UTC().Format(time.RFC3339),
	}
	
	if err := json.NewEncoder(w).Encode(metrics); err != nil {
		a.log.Errorf("Error encoding metrics response: %v", err)
	}
}

// shutdown closes all peer connections and cleans up resources
func (a *App) shutdown() {
	a.listLock.Lock()
	defer a.listLock.Unlock()

	for _, pc := range a.peerConnections {
		if pc.PeerConnection != nil {
			pc.Websocket.Close()
			if err := pc.PeerConnection.Close(); err != nil {
				a.log.Warnf("Error closing peer connection: %v", err)
			}
		}
	}

	a.peerConnections = []types.PeerConnectionState{}
	a.log.Infof("All peer connections closed")
}

// createLogger creates a logger with the appropriate level from config
func createLogger(cfg *config.Config) logging.LeveledLogger {
	loggerFactory := logging.NewDefaultLoggerFactory()
	
	// Set log level based on config
	switch cfg.LogLevel {
	case "debug":
		loggerFactory.DefaultLogLevel = logging.LogLevelDebug
	case "info":
		loggerFactory.DefaultLogLevel = logging.LogLevelInfo
	case "warn":
		loggerFactory.DefaultLogLevel = logging.LogLevelWarn
	case "error":
		loggerFactory.DefaultLogLevel = logging.LogLevelError
	default:
		loggerFactory.DefaultLogLevel = logging.LogLevelInfo
	}
	
	return loggerFactory.NewLogger("sfu-ws")
}
