package app

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

// App holds the application state
type App struct {
	cfg             *config.Config
	upgrader        websocket.Upgrader
	indexTemplate   *template.Template
	listLock        sync.RWMutex
	peerConnections []types.PeerConnectionState
	trackLocals     map[string]*webrtc.TrackLocalStaticRTP
	log             logging.LeveledLogger
}

// New creates and initializes a new App
func New() (*App, error) {
	app := &App{
		cfg: config.Load(),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		indexTemplate: &template.Template{},
		trackLocals:   make(map[string]*webrtc.TrackLocalStaticRTP),
		log:           logging.NewDefaultLoggerFactory().NewLogger("sfu-ws"),
	}

	// Read index.html from disk into memory
	indexHTML, err := os.ReadFile("index.html")
	if err != nil {
		return nil, err
	}
	app.indexTemplate = template.Must(template.New("").Parse(string(indexHTML)))

	// Initialize handlers package with context
	handlers.InitContext(&handlers.HandlerContext{
		Upgrader:              app.upgrader,
		Logger:                app.log,
		PeerConnections:       &app.peerConnections,
		TrackLocals:           &app.trackLocals,
		AddTrack:              sfu.AddTrack,
		RemoveTrack:           sfu.RemoveTrack,
		SignalPeerConnections: sfu.SignalPeerConnections,
		BroadcastChat:         sfu.BroadcastChat,
	})

	// Initialize SFU package with context
	sfu.InitContext(&sfu.SFUContext{
		Logger:          app.log,
		PeerConnections: &app.peerConnections,
		TrackLocals:     &app.trackLocals,
	})

	return app, nil
}

// Run starts the HTTP server and begins listening
func (a *App) Run() error {
	// Setup routes
	if err := routes.Setup(&routes.RouteHandlers{
		Logger:           a.log,
		IndexTemplate:    a.indexTemplate,
		DispatchKeyFrame: sfu.DispatchKeyFrame,
	}); err != nil {
		a.log.Errorf("Failed to setup routes: %v", err)
		return err
	}

	// start HTTP server
	a.log.Infof("Starting HTTP server on %s", a.cfg.Addr)
	if err := http.ListenAndServe(a.cfg.Addr, nil); err != nil { //nolint: gosec
		a.log.Errorf("Failed to start http server: %v", err)
		return err
	}

	return nil
}
