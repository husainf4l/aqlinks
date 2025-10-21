package keepalive

import (
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/logging"
)

// Config holds keepalive configuration
type Config struct {
	PingInterval  time.Duration // Interval to send pings
	PongWaitTime  time.Duration // Max time to wait for pong response
	WriteDeadline time.Duration // Deadline for writing messages
}

// DefaultConfig returns default keepalive configuration
func DefaultConfig() Config {
	return Config{
		PingInterval:  30 * time.Second,
		PongWaitTime:  60 * time.Second, // Increased: give client 60s to respond to ping
		WriteDeadline: 5 * time.Second,
	}
}

// Monitor manages WebSocket keepalive with ping/pong
type Monitor struct {
	conn         *websocket.Conn
	logger       logging.LeveledLogger
	config       Config
	done         chan struct{}
	lastPongTime atomic.Value // time.Time
	alive        atomic.Bool
}

// NewMonitor creates a new keepalive monitor
func NewMonitor(conn *websocket.Conn, logger logging.LeveledLogger, cfg Config) *Monitor {
	m := &Monitor{
		conn:   conn,
		logger: logger,
		config: cfg,
		done:   make(chan struct{}),
	}

	m.lastPongTime.Store(time.Now())
	m.alive.Store(true)

	// Set pong handler but don't set read deadline - it breaks idle connections
	// The browser WebSocket API doesn't respond to server pings anyway
	m.conn.SetPongHandler(func(appData string) error {
		m.handlePong()
		return nil
	})

	return m
}

// Start begins the keepalive ping loop
func (m *Monitor) Start() {
	go m.pingLoop()
	go m.monitorLoop()
}

// Stop stops the keepalive monitor
func (m *Monitor) Stop() {
	m.alive.Store(false)
	close(m.done)
}

// IsAlive returns true if the connection is responding to pings
func (m *Monitor) IsAlive() bool {
	return m.alive.Load()
}

// pingLoop sends periodic pings
func (m *Monitor) pingLoop() {
	ticker := time.NewTicker(m.config.PingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-m.done:
			return
		case <-ticker.C:
			if err := m.sendPing(); err != nil {
				m.logger.Warnf("Failed to send ping: %v", err)
				m.alive.Store(false)
				return
			}
		}
	}
}

// monitorLoop checks for stale connections
func (m *Monitor) monitorLoop() {
	ticker := time.NewTicker(m.config.PongWaitTime * 2)
	defer ticker.Stop()

	for {
		select {
		case <-m.done:
			return
		case <-ticker.C:
			lastPong := m.lastPongTime.Load().(time.Time)
			timeSinceLastPong := time.Since(lastPong)

			// Only mark as stale if really no activity for a long time (3x the pong wait)
			if timeSinceLastPong > m.config.PongWaitTime*3 {
				m.logger.Warnf("No pong received for %v, marking connection as stale", timeSinceLastPong)
				m.alive.Store(false)
				return
			}
		}
	}
}

// sendPing sends a ping frame
func (m *Monitor) sendPing() error {
	m.conn.SetWriteDeadline(time.Now().Add(m.config.WriteDeadline))
	err := m.conn.WriteMessage(websocket.PingMessage, []byte{})
	if err != nil {
		return err
	}
	m.logger.Debugf("Sent ping")
	return nil
}

// handlePong handles pong responses
func (m *Monitor) handlePong() {
	m.lastPongTime.Store(time.Now())
	m.logger.Debugf("Received pong")
}

// WriteWithTimeout writes a message with a deadline
func (m *Monitor) WriteWithTimeout(messageType int, data []byte) error {
	m.conn.SetWriteDeadline(time.Now().Add(m.config.WriteDeadline))
	return m.conn.WriteMessage(messageType, data)
}

// WriteJSONWithTimeout writes JSON with a deadline
func (m *Monitor) WriteJSONWithTimeout(v interface{}) error {
	m.conn.SetWriteDeadline(time.Now().Add(m.config.WriteDeadline))
	return m.conn.WriteJSON(v)
}
