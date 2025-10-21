package types

import (
	"sync"
	"testing"

	"github.com/gorilla/websocket"
)

func TestWebsocketMessage(t *testing.T) {
	msg := WebsocketMessage{
		Event: "test",
		Data:  "test data",
	}

	if msg.Event != "test" {
		t.Errorf("Expected Event to be 'test', got %s", msg.Event)
	}

	if msg.Data != "test data" {
		t.Errorf("Expected Data to be 'test data', got %s", msg.Data)
	}
}

func TestChatMessage(t *testing.T) {
	msg := ChatMessage{
		Event:   "chat",
		Message: "Hello",
		From:    "user1",
		Time:    "2025-10-21T12:00:00Z",
	}

	if msg.Event != "chat" {
		t.Errorf("Expected Event to be 'chat', got %s", msg.Event)
	}

	if msg.Message != "Hello" {
		t.Errorf("Expected Message to be 'Hello', got %s", msg.Message)
	}

	if msg.From != "user1" {
		t.Errorf("Expected From to be 'user1', got %s", msg.From)
	}
}

func TestThreadSafeWriterLock(t *testing.T) {
	tsw := &ThreadSafeWriter{
		Conn:  &websocket.Conn{},
		Mutex: sync.Mutex{},
	}

	// Simulate lock/unlock
	tsw.Lock()
	locked := true
	tsw.Unlock()
	locked = false

	if locked {
		t.Error("ThreadSafeWriter should be unlocked after Unlock()")
	}
}

func TestPeerConnectionState(t *testing.T) {
	pcs := PeerConnectionState{
		PeerConnection: nil,
		Websocket:      nil,
	}

	if pcs.PeerConnection != nil {
		t.Error("Expected PeerConnection to be nil")
	}

	if pcs.Websocket != nil {
		t.Error("Expected Websocket to be nil")
	}
}
