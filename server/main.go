package main

/*
SFU (Selective Forwarding Unit) WebRTC Server
==============================================

Architecture Overview:
- Follows Pion WebRTC v3 best practices
- Implements SFU pattern where server receives tracks and forwards to other clients
- Uses WebSocket for signaling (offer/answer/ICE candidates)

Message Flow:
1. Client connects via WebSocket to /ws?room=<roomName>
2. Server creates PeerConnection with recvonly transceivers (audio + video)
3. Server sends initial offer to client
4. Client sends answer with sendrecv transceivers
5. ICE candidates exchanged via WebSocket
6. Server's OnTrack fires when client's media arrives
7. Server creates TrackLocalStaticRTP and broadcasts to other clients
8. When new client joins, existing tracks are added and renegotiation triggered

Signaling Messages:
- offer: SDP offer from server to client
- answer: SDP answer from client to server
- candidate: ICE candidate from either party
- client-left: Notification when a participant leaves

Threading:
- Each client has readPump (reads WebSocket) and writePump (writes WebSocket)
- OnTrack handler creates goroutine to forward RTP packets
- Renegotiation runs in goroutine with mutex protection
*/

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
)

const (
	// Time allowed to write a message to the peer (optimized for low latency)
	writeWait = 5 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 30 * time.Second

	// Send pings to peer with this period. Must be less than pongWait
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer (increased for SDP messages)
	maxMessageSize = 65536 // 64KB for large SDP messages
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// Room represents a collection of clients for a specific meeting ID.
type Room struct {
	clients map[*Client]bool
	mu      sync.RWMutex
	id      string
}

// Client represents a single user connection with its WebRTC peer.
type Client struct {
	id                  string  // Connection ID (unique per WebSocket connection)
	userId              string  // User ID (persistent across reconnections)
	room                *Room
	conn                *websocket.Conn
	pc                  *webrtc.PeerConnection
	tracks              map[string]*webrtc.TrackLocalStaticRTP
	send                chan []byte
	signalingMu         sync.Mutex
	joinTime            time.Time
	hasAddedExisting    bool // Track if we've already added existing tracks
	pendingRenegotiation bool // Flag to track if renegotiation is needed
}

var (
	rooms   = make(map[string]*Room)
	roomsMu sync.RWMutex
)

func newRoom(id string) *Room {
	log.Printf("🏠 Creating new room: %s", id)
	return &Room{
		clients: make(map[*Client]bool),
		id:      id,
	}
}

func (r *Room) addClient(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	// Check for existing connection with the same userId
	for existingClient := range r.clients {
		if existingClient.userId == client.userId && existingClient.id != client.id {
			log.Printf("⚠️ Found duplicate connection for user %s (old: %s, new: %s)", 
				client.userId, existingClient.id, client.id)
			// Close the old connection
			go existingClient.cleanup()
		}
	}
	
	r.clients[client] = true
	log.Printf("👤 Client %s (user: %s) added to room %s (total clients: %d)", 
		client.id, client.userId, r.id, len(r.clients))
}

func (r *Room) removeClient(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.clients[client]; ok {
		delete(r.clients, client)
		log.Printf("👋 Client %s (user: %s) left room %s (was here for %v)", 
			client.id, client.userId, r.id, time.Since(client.joinTime))
		log.Printf("📊 Room %s now has %d clients", r.id, len(r.clients))

		// Notify other clients about the departure
		for otherClient := range r.clients {
			otherClient.notifyClientLeft(client.id)
		}
	}
}

func (r *Room) isEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients) == 0
}

// broadcastTrack sends a track to all clients in the room except the sender.
// Returns the list of RTPSenders for RTCP handling.
func (r *Room) broadcastTrack(track *webrtc.TrackLocalStaticRTP, sender *Client) []*webrtc.RTPSender {
	r.mu.RLock()
	defer r.mu.RUnlock()
	broadcastCount := 0
	var senders []*webrtc.RTPSender
	
	for client := range r.clients {
		if client == sender {
			continue
		}

		log.Printf("📡 Broadcasting %s track from %s to client %s", track.Kind(), sender.id, client.id)
		rtpSender, err := client.pc.AddTrack(track)
		if err != nil {
			log.Printf("❌ Failed to add track to client %s: %v", client.id, err)
			continue
		}
		senders = append(senders, rtpSender)
		broadcastCount++
		client.renegotiate()
	}
	log.Printf("✅ Track from %s broadcasted to %d clients", sender.id, broadcastCount)
	return senders
}

// newClient creates and initializes a new client.
func newClient(room *Room, conn *websocket.Conn, userId string) (*Client, error) {
	clientID := uuid.New().String()
	log.Printf("🔗 New connection: Client %s (user: %s) joining room: %s", clientID, userId, room.id)

	// Configure SettingEngine for optimal performance
	s := webrtc.SettingEngine{}
	// Enable all network types for maximum compatibility
	s.SetNetworkTypes([]webrtc.NetworkType{
		webrtc.NetworkTypeUDP4, 
		webrtc.NetworkTypeUDP6,
		webrtc.NetworkTypeTCP4,
		webrtc.NetworkTypeTCP6,
	})
	
	// Optimize ICE timeouts for faster connection (but not too aggressive)
	s.SetICETimeouts(
		7*time.Second,  // disconnectedTimeout
		25*time.Second, // failedTimeout
		2*time.Second,  // keepAliveInterval
	)

	m := &webrtc.MediaEngine{}
	if err := m.RegisterDefaultCodecs(); err != nil {
		return nil, fmt.Errorf("failed to register codecs for client %s: %w", clientID, err)
	}

	api := webrtc.NewAPI(webrtc.WithSettingEngine(s), webrtc.WithMediaEngine(m))
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
			{URLs: []string{"stun:stun1.l.google.com:19302"}},
		},
		ICETransportPolicy: webrtc.ICETransportPolicyAll,
	}
	pc, err := api.NewPeerConnection(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create PeerConnection for client %s: %w", clientID, err)
	}
	log.Printf("✅ PeerConnection created for client %s", clientID)

	// Add transceivers to receive audio and video from the client
	// This follows Pion WebRTC best practice for SFU architecture
	if _, err := pc.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionRecvonly,
	}); err != nil {
		return nil, fmt.Errorf("failed to add audio transceiver for client %s: %w", clientID, err)
	}
	if _, err := pc.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionRecvonly,
	}); err != nil {
		return nil, fmt.Errorf("failed to add video transceiver for client %s: %w", clientID, err)
	}
	log.Printf("✅ Added audio and video transceivers for client %s", clientID)

	client := &Client{
		id:               clientID,
		userId:           userId,
		room:             room,
		conn:             conn,
		pc:               pc,
		tracks:           make(map[string]*webrtc.TrackLocalStaticRTP),
		send:             make(chan []byte, 256),
		joinTime:         time.Now(),
		hasAddedExisting: true, // Set to true since we add them immediately below
	}

	// Add existing tracks from other clients BEFORE adding to room and sending offer
	// This prevents double renegotiation
	room.mu.RLock()
	var existingTracks []*webrtc.TrackLocalStaticRTP
	for otherClient := range room.clients {
		for _, track := range otherClient.tracks {
			existingTracks = append(existingTracks, track)
		}
	}
	room.mu.RUnlock()

	if len(existingTracks) > 0 {
		log.Printf("➕ Adding %d existing tracks to new client %s BEFORE initial offer", len(existingTracks), clientID)
		for _, track := range existingTracks {
			if _, err := pc.AddTrack(track); err != nil {
				log.Printf("❌ Failed to add existing track %s to client %s: %v", track.ID(), clientID, err)
			}
		}
	}

	room.addClient(client)

	return client, nil
}

func (c *Client) cleanup() {
	log.Printf("🧹 Cleaning up client %s", c.id)
	c.room.removeClient(c)
	if c.pc != nil && c.pc.ConnectionState() != webrtc.PeerConnectionStateClosed {
		c.pc.Close()
		log.Printf("🛑 Closed peer connection for client %s", c.id)
	}
	c.conn.Close()
}

// readPump pumps messages from the websocket connection to the hub.
func (c *Client) readPump() {
	defer c.cleanup()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { c.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })

	for {
		var msg map[string]interface{}
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("❌ Client %s - Read error: %v", c.id, err)
			}
			break
		}
		c.handleMessage(msg)
	}
}

// writePump pumps messages from the hub to the websocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) sendMessage(msgType string, data interface{}) {
	payload, err := json.Marshal(map[string]interface{}{"type": msgType, "data": data})
	if err != nil {
		log.Printf("❌ Client %s - Failed to marshal message: %v", c.id, err)
		return
	}
	select {
	case c.send <- payload:
	default:
		log.Printf("⚠️ Client %s - Send channel full, dropping message", c.id)
	}
}

func (c *Client) notifyClientLeft(clientID string) {
	c.sendMessage("client-left", map[string]string{"clientId": clientID})
}

// renegotiate triggers the WebRTC renegotiation process by creating and sending an offer.
func (c *Client) renegotiate() {
	go func() {
		c.signalingMu.Lock()
		defer c.signalingMu.Unlock()

		if c.pc.SignalingState() != webrtc.SignalingStateStable {
			log.Printf("⏭️ Deferring renegotiation for client %s - not in stable state (current: %s)", c.id, c.pc.SignalingState())
			c.pendingRenegotiation = true
			return
		}

		// Clear the pending flag BEFORE creating offer
		wasPending := c.pendingRenegotiation
		c.pendingRenegotiation = false
		
		if wasPending {
			log.Printf("🔄 Executing pending renegotiation for client %s", c.id)
		} else {
			log.Printf("🔄 Triggering renegotiation for client %s", c.id)
		}
		
		offer, err := c.pc.CreateOffer(nil)
		if err != nil {
			log.Printf("❌ Failed to create renegotiation offer for client %s: %v", c.id, err)
			return
		}
		if err := c.pc.SetLocalDescription(offer); err != nil {
			log.Printf("❌ Failed to set local description for client %s: %v", c.id, err)
			return
		}
		log.Printf("📤 Sending renegotiation offer to client %s", c.id)
		c.sendMessage("offer", offer)
	}()
}

func (c *Client) handleMessage(msg map[string]interface{}) {
	msgType, _ := msg["type"].(string)
	log.Printf("📨 Client %s - Received message type: %s", c.id, msgType)

	c.signalingMu.Lock()
	defer c.signalingMu.Unlock()

	switch msgType {
	case "offer":
		var offer webrtc.SessionDescription
		if err := decode(msg["data"], &offer); err != nil {
			log.Printf("❌ Client %s - Failed to decode offer: %v", c.id, err)
			return
		}

		if err := c.pc.SetRemoteDescription(offer); err != nil {
			log.Printf("❌ Client %s - Set remote desc (offer) error: %v", c.id, err)
			return
		}

		answer, err := c.pc.CreateAnswer(nil)
		if err != nil {
			log.Printf("❌ Client %s - Create answer error: %v", c.id, err)
			return
		}

		if err := c.pc.SetLocalDescription(answer); err != nil {
			log.Printf("❌ Client %s - Set local desc (answer) error: %v", c.id, err)
			return
		}
		c.sendMessage("answer", answer)

	case "answer":
		var answer webrtc.SessionDescription
		if err := decode(msg["data"], &answer); err != nil {
			log.Printf("❌ Client %s - Failed to decode answer: %v", c.id, err)
			return
		}
		if err := c.pc.SetRemoteDescription(answer); err != nil {
			log.Printf("❌ Client %s - Set remote desc (answer) error: %v", c.id, err)
			return
		}
		
		// Check if we need to trigger a pending renegotiation
		// Add a small delay to ensure signaling state is fully stable
		if c.pendingRenegotiation {
			log.Printf("🔄 Client %s - Scheduling pending renegotiation after answer", c.id)
			go func() {
				time.Sleep(100 * time.Millisecond)
				c.renegotiate()
			}()
		}

	case "candidate":
		var candidate webrtc.ICECandidateInit
		if err := decode(msg["data"], &candidate); err != nil {
			log.Printf("❌ Client %s - Failed to decode candidate: %v", c.id, err)
			return
		}
		if err := c.pc.AddICECandidate(candidate); err != nil {
			log.Printf("❌ Client %s - Add ICE candidate error: %v", c.id, err)
		}
	}
}

func (c *Client) setupPeerConnectionHandlers() {
	// Log transceiver state
	transceivers := c.pc.GetTransceivers()
	log.Printf("📊 Client %s has %d transceivers", c.id, len(transceivers))
	for i, t := range transceivers {
		log.Printf("  Transceiver %d: kind=%s, direction=%s, mid=%s", i, t.Kind(), t.Direction(), t.Mid())
	}

	c.pc.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		log.Printf("🎬 OnTrack fired for client %s: %s (kind: %s, ID: %s, StreamID: %s)", 
			c.id, track.Kind(), track.Kind(), track.ID(), track.StreamID())

		// Use client ID as stream ID so frontend can match when client leaves
		localTrack, err := webrtc.NewTrackLocalStaticRTP(track.Codec().RTPCodecCapability, track.ID(), c.id)
		if err != nil {
			log.Printf("❌ Failed to create local track for client %s: %v", c.id, err)
			return
		}
		c.tracks[track.ID()] = localTrack
		log.Printf("📝 Client %s now has %d tracks (using client ID as stream ID)", c.id, len(c.tracks))

		// Broadcast track to other clients and get senders
		senders := c.room.broadcastTrack(localTrack, c)

		// CRITICAL: Read RTP packets from remote track and forward to local track
		go func() {
			rtpBuf := make([]byte, 1500)
			for {
				i, _, readErr := track.Read(rtpBuf)
				if readErr != nil {
					log.Printf("❌ Track read error for client %s: %v", c.id, readErr)
					return
				}
				if _, writeErr := localTrack.Write(rtpBuf[:i]); writeErr != nil {
					log.Printf("❌ Track write error for client %s: %v", c.id, writeErr)
					return
				}
			}
		}()

		// CRITICAL: Read RTCP packets from each sender (Pion best practice)
		// This prevents memory leaks and ensures proper connection quality
		for _, sender := range senders {
			go func(s *webrtc.RTPSender) {
				rtcpBuf := make([]byte, 1500)
				for {
					if _, _, rtcpErr := s.Read(rtcpBuf); rtcpErr != nil {
						log.Printf("❌ RTCP read error for client %s: %v", c.id, rtcpErr)
						return
					}
					// RTCP packets are processed internally by Pion
					// Reading them prevents buffer buildup
				}
			}(sender)
		}
	})

	c.pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Printf("🧊 Client %s - ICE Connection State: %s", c.id, state.String())
	})

	c.pc.OnSignalingStateChange(func(state webrtc.SignalingState) {
		log.Printf("📡 Client %s - Signaling State: %s", c.id, state.String())
		// Pending renegotiations are now handled in the answer message handler
	})

	c.pc.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate == nil {
			log.Printf("🧊 Client %s - ICE gathering complete", c.id)
			return
		}
		c.sendMessage("candidate", candidate.ToJSON())
	})
}

func serveWs(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		roomID = "default"
	}

	// Extract userId from query parameter
	userId := r.URL.Query().Get("userId")
	if userId == "" {
		// Fallback to generating a UUID if no userId provided
		userId = uuid.New().String()
		log.Printf("⚠️ No userId provided, generated: %s", userId)
	}

	roomsMu.Lock()
	room, ok := rooms[roomID]
	if !ok {
		room = newRoom(roomID)
		rooms[roomID] = room
	}
	roomsMu.Unlock()

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("❌ Upgrade error: %v", err)
		return
	}

	client, err := newClient(room, conn, userId)
	if err != nil {
		log.Printf("❌ Failed to create client: %v", err)
		conn.Close()
		return
	}

	client.setupPeerConnectionHandlers()

	// Allow collection of memory referenced by the caller by doing all work in new goroutines.
	go client.writePump()
	go client.readPump()

	// Start the connection by sending an offer to the client
	client.renegotiate()

	// Schedule cleanup of the room if it becomes empty
	go func() {
		<-r.Context().Done()
		time.Sleep(10 * time.Second) // Grace period
		roomsMu.Lock()
		if room.isEmpty() {
			log.Printf("🗑️ Removing empty room: %s", roomID)
			delete(rooms, roomID)
		}
		roomsMu.Unlock()
	}()
}

// decode is a helper to unmarshal JSON from a map[string]interface{}.
func decode(data interface{}, v interface{}) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

func main() {
	http.HandleFunc("/ws", serveWs)

	log.Println("🚀 SFU server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("❌ ListenAndServe error: %v", err)
	}
}
