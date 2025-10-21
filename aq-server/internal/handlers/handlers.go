package handlers

import (
	"encoding/json"
	"net/http"
	"sync"

	"aq-server/internal/types"
	"github.com/gorilla/websocket"
	"github.com/pion/logging"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
)

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

// HandlerContext holds all the state needed by the handler
type HandlerContext struct {
	Upgrader              websocket.Upgrader
	Logger                logging.LeveledLogger
	ListLock              sync.RWMutex
	PeerConnections       *[]types.PeerConnectionState
	TrackLocals           *map[string]*webrtc.TrackLocalStaticRTP
	AddTrack              func(*webrtc.TrackRemote) *webrtc.TrackLocalStaticRTP
	RemoveTrack           func(*webrtc.TrackLocalStaticRTP)
	SignalPeerConnections func()
	BroadcastChat         func(types.ChatMessage, *types.ThreadSafeWriter)
}

var handlerCtx *HandlerContext

// InitContext initializes the handler context
func InitContext(ctx *HandlerContext) {
	handlerCtx = ctx
}

// Handle incoming websockets.
func WebsocketHandler(w http.ResponseWriter, r *http.Request) { // nolint
	if handlerCtx == nil {
		handlerCtx.Logger.Errorf("Handler context not initialized")
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	// Upgrade HTTP request to Websocket
	unsafeConn, err := handlerCtx.Upgrader.Upgrade(w, r, nil)
	if err != nil {
		handlerCtx.Logger.Errorf("Failed to upgrade HTTP to Websocket: ", err)

		return
	}

	c := &types.ThreadSafeWriter{Conn: unsafeConn, Mutex: sync.Mutex{}} // nolint

	// When this frame returns close the Websocket
	defer c.Close() //nolint

	// Create new PeerConnection
	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		handlerCtx.Logger.Errorf("Failed to creates a PeerConnection: %v", err)

		return
	}

	// When this frame returns close the PeerConnection
	defer peerConnection.Close() //nolint

	// Accept one audio and one video track incoming
	for _, typ := range []webrtc.RTPCodecType{webrtc.RTPCodecTypeVideo, webrtc.RTPCodecTypeAudio} {
		if _, err := peerConnection.AddTransceiverFromKind(typ, webrtc.RTPTransceiverInit{
			Direction: webrtc.RTPTransceiverDirectionRecvonly,
		}); err != nil {
			handlerCtx.Logger.Errorf("Failed to add transceiver: %v", err)

			return
		}
	}

	// Add our new PeerConnection to global list
	handlerCtx.ListLock.Lock()
	*handlerCtx.PeerConnections = append(*handlerCtx.PeerConnections, types.PeerConnectionState{PeerConnection: peerConnection, Websocket: c})
	handlerCtx.ListLock.Unlock()

	// Trickle ICE. Emit server candidate to client
	peerConnection.OnICECandidate(func(i *webrtc.ICECandidate) {
		if i == nil {
			return
		}
		// If you are serializing a candidate make sure to use ToJSON
		// Using Marshal will result in errors around `sdpMid`
		candidateString, err := json.Marshal(i.ToJSON())
		if err != nil {
			handlerCtx.Logger.Errorf("Failed to marshal candidate to json: %v", err)

			return
		}

		handlerCtx.Logger.Infof("Send candidate to client: %s", candidateString)

		if writeErr := c.WriteJSON(&types.WebsocketMessage{
			Event: "candidate",
			Data:  string(candidateString),
		}); writeErr != nil {
			handlerCtx.Logger.Errorf("Failed to write JSON: %v", writeErr)
		}
	})

	// If PeerConnection is closed remove it from global list
	peerConnection.OnConnectionStateChange(func(p webrtc.PeerConnectionState) {
		handlerCtx.Logger.Infof("Connection state change: %s", p)

		switch p {
		case webrtc.PeerConnectionStateFailed:
			if err := peerConnection.Close(); err != nil {
				handlerCtx.Logger.Errorf("Failed to close PeerConnection: %v", err)
			}
		case webrtc.PeerConnectionStateClosed:
			handlerCtx.SignalPeerConnections()
		default:
		}
	})

	peerConnection.OnTrack(func(t *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		handlerCtx.Logger.Infof("Got remote track: Kind=%s, ID=%s, PayloadType=%d", t.Kind(), t.ID(), t.PayloadType())

		// Create a track to fan out our incoming video to all peers
		trackLocal := handlerCtx.AddTrack(t)
		defer handlerCtx.RemoveTrack(trackLocal)

		buf := make([]byte, 1500)
		rtpPkt := &rtp.Packet{}

		for {
			i, _, err := t.Read(buf)
			if err != nil {
				return
			}

			if err = rtpPkt.Unmarshal(buf[:i]); err != nil {
				handlerCtx.Logger.Errorf("Failed to unmarshal incoming RTP packet: %v", err)

				return
			}

			rtpPkt.Extension = false
			rtpPkt.Extensions = nil

			if err = trackLocal.WriteRTP(rtpPkt); err != nil {
				return
			}
		}
	})

	peerConnection.OnICEConnectionStateChange(func(is webrtc.ICEConnectionState) {
		handlerCtx.Logger.Infof("ICE connection state changed: %s", is)
	})

	// Signal for the new PeerConnection
	handlerCtx.SignalPeerConnections()

	message := &types.WebsocketMessage{}
	for {
		_, raw, err := c.ReadMessage()
		if err != nil {
			// Check if it's a normal close (user left)
			if websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				handlerCtx.Logger.Infof("Client disconnected normally")
			} else {
				handlerCtx.Logger.Errorf("Failed to read message: %v", err)
			}

			return
		}

		handlerCtx.Logger.Infof("Got message: %s", raw)

		if err := json.Unmarshal(raw, &message); err != nil {
			handlerCtx.Logger.Errorf("Failed to unmarshal json to message: %v", err)

			return
		}

		switch message.Event {
		case "candidate":
			candidate := webrtc.ICECandidateInit{}
			if err := json.Unmarshal([]byte(message.Data), &candidate); err != nil {
				handlerCtx.Logger.Errorf("Failed to unmarshal json to candidate: %v", err)

				return
			}

			handlerCtx.Logger.Infof("Got candidate: %v", candidate)

			if err := peerConnection.AddICECandidate(candidate); err != nil {
				handlerCtx.Logger.Errorf("Failed to add ICE candidate: %v", err)

				return
			}
		case "answer":
			answer := webrtc.SessionDescription{}
			if err := json.Unmarshal([]byte(message.Data), &answer); err != nil {
				handlerCtx.Logger.Errorf("Failed to unmarshal json to answer: %v", err)

				return
			}

			handlerCtx.Logger.Infof("Got answer: %v", answer)

			if err := peerConnection.SetRemoteDescription(answer); err != nil {
				handlerCtx.Logger.Errorf("Failed to set remote description: %v", err)

				return
			}
		case "chat":
			// Handle chat message
			chatMsg := types.ChatMessage{
				Event:   "chat",
				Message: message.Data,
				Time:    "15:04:05",
			}

			handlerCtx.Logger.Infof("Broadcasting chat message: %s", message.Data)

			// Broadcast to all other peers
			handlerCtx.BroadcastChat(chatMsg, c)
		default:
			handlerCtx.Logger.Errorf("unknown message: %+v", message)
		}
	}
}
