package metrics

import (
	"encoding/json"
	"sync"
	"time"
)

// Metrics holds application metrics
type Metrics struct {
	mu                      sync.RWMutex
	ActiveConnections       int       `json:"active_connections"`
	TotalConnectionsCreated int       `json:"total_connections_created"`
	TotalConnectionsClosed  int       `json:"total_connections_closed"`
	TotalMessagesProcessed  int       `json:"total_messages_processed"`
	TotalChatMessages       int       `json:"total_chat_messages"`
	TotalTracksAdded        int       `json:"total_tracks_added"`
	TotalTracksRemoved      int       `json:"total_tracks_removed"`
	StartTime               time.Time `json:"start_time"`
	LastReset               time.Time `json:"last_reset"`
}

var globalMetrics = &Metrics{
	StartTime: time.Now(),
	LastReset: time.Now(),
}

// Get returns a snapshot of current metrics
func Get() *Metrics {
	globalMetrics.mu.RLock()
	defer globalMetrics.mu.RUnlock()

	return &Metrics{
		ActiveConnections:       globalMetrics.ActiveConnections,
		TotalConnectionsCreated: globalMetrics.TotalConnectionsCreated,
		TotalConnectionsClosed:  globalMetrics.TotalConnectionsClosed,
		TotalMessagesProcessed:  globalMetrics.TotalMessagesProcessed,
		TotalChatMessages:       globalMetrics.TotalChatMessages,
		TotalTracksAdded:        globalMetrics.TotalTracksAdded,
		TotalTracksRemoved:      globalMetrics.TotalTracksRemoved,
		StartTime:               globalMetrics.StartTime,
		LastReset:               globalMetrics.LastReset,
	}
}

// RecordConnectionCreated increments connection counter
func RecordConnectionCreated() {
	globalMetrics.mu.Lock()
	defer globalMetrics.mu.Unlock()
	globalMetrics.ActiveConnections++
	globalMetrics.TotalConnectionsCreated++
}

// RecordConnectionClosed decrements active connection counter
func RecordConnectionClosed() {
	globalMetrics.mu.Lock()
	defer globalMetrics.mu.Unlock()
	if globalMetrics.ActiveConnections > 0 {
		globalMetrics.ActiveConnections--
	}
	globalMetrics.TotalConnectionsClosed++
}

// RecordMessageProcessed increments message counter
func RecordMessageProcessed() {
	globalMetrics.mu.Lock()
	defer globalMetrics.mu.Unlock()
	globalMetrics.TotalMessagesProcessed++
}

// RecordChatMessage increments chat message counter
func RecordChatMessage() {
	globalMetrics.mu.Lock()
	defer globalMetrics.mu.Unlock()
	globalMetrics.TotalChatMessages++
}

// RecordTrackAdded increments track added counter
func RecordTrackAdded() {
	globalMetrics.mu.Lock()
	defer globalMetrics.mu.Unlock()
	globalMetrics.TotalTracksAdded++
}

// RecordTrackRemoved increments track removed counter
func RecordTrackRemoved() {
	globalMetrics.mu.Lock()
	defer globalMetrics.mu.Unlock()
	globalMetrics.TotalTracksRemoved++
}

// Reset resets all metrics to zero
func Reset() {
	globalMetrics.mu.Lock()
	defer globalMetrics.mu.Unlock()
	globalMetrics.ActiveConnections = 0
	globalMetrics.TotalConnectionsCreated = 0
	globalMetrics.TotalConnectionsClosed = 0
	globalMetrics.TotalMessagesProcessed = 0
	globalMetrics.TotalChatMessages = 0
	globalMetrics.TotalTracksAdded = 0
	globalMetrics.TotalTracksRemoved = 0
	globalMetrics.LastReset = time.Now()
}

// ToJSON returns metrics as JSON
func (m *Metrics) ToJSON() []byte {
	data, _ := json.MarshalIndent(m, "", "  ")
	return data
}

// Uptime returns how long the server has been running
func (m *Metrics) Uptime() time.Duration {
	return time.Since(m.StartTime)
}
