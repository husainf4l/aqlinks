package types

import (
	"sync"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v4"
)

type WebsocketMessage struct {
	Event string `json:"event"`
	Data  string `json:"data"`
}

type ChatMessage struct {
	Event   string `json:"event"`
	Message string `json:"message"`
	From    string `json:"from,omitempty"`
	Time    string `json:"time"`
}

type PeerConnectionState struct {
	PeerConnection *webrtc.PeerConnection
	Websocket      *ThreadSafeWriter
}

type ThreadSafeWriter struct {
	*websocket.Conn
	sync.Mutex
}

func (t *ThreadSafeWriter) WriteJSON(v any) error {
	t.Lock()
	defer t.Unlock()

	return t.Conn.WriteJSON(v)
}
