package app

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"text/template"
	"time"

	"aq-server/internal/config"
	"aq-server/internal/database"
	"aq-server/internal/handlers"
	"aq-server/internal/keepalive"
	"aq-server/internal/room"
	"aq-server/internal/routes"
	"aq-server/internal/sfu"
	"aq-server/internal/types"
	"github.com/gorilla/websocket"
	"github.com/pion/logging"
	"github.com/pion/webrtc/v4"
)

// App holds the application state
type App struct {
	cfg             *config.Config
	upgrader        websocket.Upgrader
	indexTemplate   *template.Template
	listLock        sync.RWMutex
	peerConnections []types.PeerConnectionState
	trackLocals     map[string]*webrtc.TrackLocalStaticRTP
	log             logging.LeveledLogger
	roomManager     *room.RoomManager // New: room management
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
	
	app := &App{
		cfg: cfg,
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

// Run starts the HTTP server and begins listening with graceful shutdown support
func (a *App) Run() error {
	// Setup routes
	if err := routes.Setup(&routes.RouteHandlers{
		Logger:           a.log,
		IndexTemplate:    a.indexTemplate,
		DispatchKeyFrame: sfu.DispatchKeyFrame,
		GetPeerCount:     sfu.GetPeerCount,
		RoomManager:      a.roomManager,
	}); err != nil {
		a.log.Errorf("Failed to setup routes: %v", err)
		return err
	}

	// Create HTTP server
	server := &http.Server{
		Addr:    a.cfg.Addr,
		Handler: nil, // uses DefaultServeMux
	}

	// Channel to signal server errors
	serverErrors := make(chan error, 1)

	// Start server in a goroutine
	go func() {
		a.log.Infof("Starting HTTP server on %s", a.cfg.Addr)
		serverErrors <- server.ListenAndServe()
	}()

	// Setup signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Wait for shutdown signal or server error
	select {
	case sig := <-sigChan:
		a.log.Infof("Received signal: %v, initiating graceful shutdown", sig)
	case err := <-serverErrors:
		if err != http.ErrServerClosed {
			a.log.Errorf("Server error: %v", err)
			return err
		}
	}

	// Gracefully shutdown with 10 second timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	a.log.Infof("Closing peer connections...")
	a.shutdown()

	a.log.Infof("Shutting down HTTP server...")
	if err := server.Shutdown(ctx); err != nil {
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
