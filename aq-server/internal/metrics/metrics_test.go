package metrics

import (
	"testing"
	"time"
)

func TestRecordConnectionCreated(t *testing.T) {
	Reset()

	initialCount := Get().ActiveConnections
	RecordConnectionCreated()

	metrics := Get()
	if metrics.ActiveConnections != initialCount+1 {
		t.Errorf("Expected ActiveConnections to be %d, got %d", initialCount+1, metrics.ActiveConnections)
	}

	if metrics.TotalConnectionsCreated != 1 {
		t.Errorf("Expected TotalConnectionsCreated to be 1, got %d", metrics.TotalConnectionsCreated)
	}
}

func TestRecordConnectionClosed(t *testing.T) {
	Reset()

	RecordConnectionCreated()
	RecordConnectionClosed()

	metrics := Get()
	if metrics.ActiveConnections != 0 {
		t.Errorf("Expected ActiveConnections to be 0, got %d", metrics.ActiveConnections)
	}

	if metrics.TotalConnectionsClosed != 1 {
		t.Errorf("Expected TotalConnectionsClosed to be 1, got %d", metrics.TotalConnectionsClosed)
	}
}

func TestRecordMessageProcessed(t *testing.T) {
	Reset()

	RecordMessageProcessed()
	RecordMessageProcessed()

	metrics := Get()
	if metrics.TotalMessagesProcessed != 2 {
		t.Errorf("Expected TotalMessagesProcessed to be 2, got %d", metrics.TotalMessagesProcessed)
	}
}

func TestRecordChatMessage(t *testing.T) {
	Reset()

	RecordChatMessage()

	metrics := Get()
	if metrics.TotalChatMessages != 1 {
		t.Errorf("Expected TotalChatMessages to be 1, got %d", metrics.TotalChatMessages)
	}
}

func TestRecordTrackAdded(t *testing.T) {
	Reset()

	RecordTrackAdded()

	metrics := Get()
	if metrics.TotalTracksAdded != 1 {
		t.Errorf("Expected TotalTracksAdded to be 1, got %d", metrics.TotalTracksAdded)
	}
}

func TestRecordTrackRemoved(t *testing.T) {
	Reset()

	RecordTrackRemoved()

	metrics := Get()
	if metrics.TotalTracksRemoved != 1 {
		t.Errorf("Expected TotalTracksRemoved to be 1, got %d", metrics.TotalTracksRemoved)
	}
}

func TestReset(t *testing.T) {
	Reset()

	RecordConnectionCreated()
	RecordMessageProcessed()
	RecordChatMessage()

	Reset()

	metrics := Get()
	if metrics.ActiveConnections != 0 || metrics.TotalConnectionsCreated != 0 ||
		metrics.TotalMessagesProcessed != 0 || metrics.TotalChatMessages != 0 {
		t.Error("Expected all metrics to be reset to 0")
	}
}

func TestUptime(t *testing.T) {
	m := Get()
	uptime := m.Uptime()

	if uptime < 0 {
		t.Errorf("Expected Uptime to be non-negative, got %v", uptime)
	}

	// Uptime should be very small if called right after Get()
	if uptime > time.Second {
		t.Errorf("Expected Uptime to be small, got %v", uptime)
	}
}

func TestToJSON(t *testing.T) {
	Reset()

	RecordConnectionCreated()
	m := Get()
	data := m.ToJSON()

	if len(data) == 0 {
		t.Error("Expected JSON data to be non-empty")
	}

	if !containsSubstring(string(data), "active_connections") {
		t.Error("Expected JSON to contain 'active_connections'")
	}
}

func containsSubstring(s, substr string) bool {
	for i := 0; i < len(s)-len(substr)+1; i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
