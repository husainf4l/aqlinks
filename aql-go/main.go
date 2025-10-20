package main

import (
        "encoding/json"
        "fmt"
        "log"
        "net/http"
        "sync"
        "time"

        "github.com/gorilla/websocket"
        "github.com/pion/webrtc/v3"
)

var upgrader = websocket.Upgrader{
        CheckOrigin: func(r *http.Request) bool { return true },
}

type Room struct {
        clients map[*websocket.Conn]*Client
        mu      sync.RWMutex
        id      string
}

type Client struct {
        pc       *webrtc.PeerConnection
        tracks   map[string]*webrtc.TrackLocalStaticRTP
        id       string
        joinTime time.Time
}

func newRoom(id string) *Room {
        log.Printf("🏠 Creating new room: %s", id)
        return &Room{
                clients: make(map[*websocket.Conn]*Client),
                id:      id,
        }
}

func (r *Room) addClient(conn *websocket.Conn, pc *webrtc.PeerConnection, clientID string) *Client {
        r.mu.Lock()
        defer r.mu.Unlock()
        client := &Client{
                pc:       pc,
                tracks:   make(map[string]*webrtc.TrackLocalStaticRTP),
                id:       clientID,
                joinTime: time.Now(),
        }
        r.clients[conn] = client
        log.Printf("👤 Client %s added to room %s (total clients: %d)", clientID, r.id, len(r.clients))
        return client
}

func (r *Room) removeClient(conn *websocket.Conn) {
        r.mu.Lock()
        defer r.mu.Unlock()
        if client, ok := r.clients[conn]; ok {
                log.Printf("👋 Client %s left room %s (was here for %v)", client.id, r.id, time.Since(client.joinTime))
                delete(r.clients, conn)
                log.Printf("📊 Room %s now has %d clients", r.id, len(r.clients))
        }
}

func (r *Room) broadcastTrack(track *webrtc.TrackLocalStaticRTP, except *websocket.Conn, sourceClientID string) {
        r.mu.RLock()
        defer r.mu.RUnlock()
        broadcastCount := 0
        for conn, client := range r.clients {
                if conn == except {
                        continue
                }
                log.Printf("📡 Broadcasting %s track from %s to client %s", track.Kind(), sourceClientID, client.id)
                if _, err := client.pc.AddTrack(track); err != nil {
                        log.Printf("❌ Failed to add track to client %s: %v", client.id, err)
                } else {
                        broadcastCount++
                }
        }
        log.Printf("✅ Track broadcasted to %d clients", broadcastCount)
}

func handleConnection(room *Room, conn *websocket.Conn, clientID string) {
        defer conn.Close()

        log.Printf("=== HANDLE CONNECTION START === Client: %s", clientID)

        // Create a SettingEngine to configure network settings
        s := webrtc.SettingEngine{}
        s.SetNetworkTypes([]webrtc.NetworkType{
                webrtc.NetworkTypeUDP4,
                webrtc.NetworkTypeUDP6,
        })

        // Create MediaEngine
        m := &webrtc.MediaEngine{}
        if err := m.RegisterDefaultCodecs(); err != nil {
                log.Printf("❌ Failed to register codecs for client %s: %v", clientID, err)
                return
        }

        // Create the API object with the SettingEngine and MediaEngine
        api := webrtc.NewAPI(webrtc.WithSettingEngine(s), webrtc.WithMediaEngine(m))

        config := webrtc.Configuration{
                ICEServers: []webrtc.ICEServer{
                        {URLs: []string{"stun:stun.l.google.com:19302"}},
                        {URLs: []string{"stun:stun1.l.google.com:19302"}},
                        {URLs: []string{"stun:stun2.l.google.com:19302"}},
                },
        }
        pc, err := api.NewPeerConnection(config)
        if err != nil {
                log.Printf("❌ Failed to create PeerConnection for client %s: %v", clientID, err)
                return
        }
        log.Printf("✅ PeerConnection created for client %s", clientID)

        client := room.addClient(conn, pc, clientID)
        defer room.removeClient(conn)
        defer pc.Close()

        // Add existing tracks to new client
        log.Printf("🔍 Checking for existing tracks to add to new client %s", clientID)
        room.mu.RLock()
        existingTrackCount := 0
        for _, otherClient := range room.clients {
                if otherClient.pc == pc {
                        continue
                }
                for trackID, track := range otherClient.tracks {
                        log.Printf("➕ Adding existing track %s (%s) from client %s to new client %s", 
                                trackID, track.Kind(), otherClient.id, clientID)
                        if _, err := pc.AddTrack(track); err != nil {
                                log.Printf("❌ Failed to add existing track: %v", err)
                        } else {
                                existingTrackCount++
                        }
                }
        }
        room.mu.RUnlock()
        log.Printf("📊 Added %d existing tracks to client %s", existingTrackCount, clientID)

        pc.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
                log.Printf("🎬 OnTrack fired for client %s: %s (kind: %s, ID: %s)", 
                        clientID, track.Kind(), track.Kind(), track.ID())
                
                localTrack, err := webrtc.NewTrackLocalStaticRTP(track.Codec().RTPCodecCapability, track.ID(), track.StreamID())
                if err != nil {
                        log.Printf("❌ Failed to create local track for client %s: %v", clientID, err)
                        return
                }
                log.Printf("✅ Local track created for client %s: %s", clientID, track.ID())
                
                client.tracks[track.ID()] = localTrack
                log.Printf("📝 Client %s now has %d tracks", clientID, len(client.tracks))
                
                room.broadcastTrack(localTrack, conn, clientID)
                
                go func() {
                        rtpBuf := make([]byte, 1400)
                        packetCount := 0
                        for {
                                i, _, err := track.Read(rtpBuf)
                                if err != nil {
                                        log.Printf("❌ Track read error for client %s: %v", clientID, err)
                                        return
                                }
                                if _, err := localTrack.Write(rtpBuf[:i]); err != nil {
                                        log.Printf("❌ Track write error for client %s: %v", clientID, err)
                                        return
                                }
                                packetCount++
                                if packetCount%1000 == 0 {
                                        log.Printf("📦 Client %s: %d RTP packets forwarded for track %s", 
                                                clientID, packetCount, track.Kind())
                                }
                        }
                }()
        })

        pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
                log.Printf("🧊 Client %s - ICE Connection State: %s", clientID, state.String())
                if state == webrtc.ICEConnectionStateFailed {
                        log.Printf("❌ Client %s - ICE connection failed - check firewall/NAT settings", clientID)
                } else if state == webrtc.ICEConnectionStateConnected {
                        log.Printf("✅ Client %s - ICE connection established successfully!", clientID)
                } else if state == webrtc.ICEConnectionStateDisconnected {
                        log.Printf("⚠️ Client %s - ICE connection disconnected", clientID)
                } else if state == webrtc.ICEConnectionStateClosed {
                        log.Printf("❌ Client %s - ICE connection closed", clientID)
                }
        })

        pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
                log.Printf("🔌 Client %s - Peer Connection State: %s", clientID, state.String())
        })

        pc.OnSignalingStateChange(func(state webrtc.SignalingState) {
                log.Printf("📡 Client %s - Signaling State: %s", clientID, state.String())
        })

        pc.OnICECandidate(func(c *webrtc.ICECandidate) {
                if c == nil {
                        log.Printf("🧊 Client %s - ICE gathering complete", clientID)
                        return
                }
                log.Printf("🧊 Client %s - Generated ICE candidate: %s", clientID, "candidate: " + c.String())
                conn.WriteJSON(map[string]interface{}{
                        "type": "candidate",
                        "data": c.ToJSON(),
                })
        })

        for {
                var msg map[string]interface{}
                err := conn.ReadJSON(&msg)
                if err != nil {
                        log.Printf("❌ Client %s - Read error: %v", clientID, err)
                        break
                }
                
                msgType, _ := msg["type"].(string)
                log.Printf("📨 Client %s - Received message type: %s", clientID, msgType)
                
                switch msgType {
                case "offer":
                        log.Printf("📥 Client %s - Processing OFFER", clientID)
                        offer := webrtc.SessionDescription{}
                        offerData, _ := json.Marshal(msg["data"])
                        if err := json.Unmarshal(offerData, &offer); err != nil {
                                log.Printf("❌ Client %s - Failed to unmarshal offer: %v", clientID, err)
                                continue
                        }
                        
                        log.Printf("📝 Client %s - Offer SDP (first 100 chars): %s", clientID, offer.SDP[:100])
                        log.Printf("🔧 Client %s - Setting remote description (offer)", clientID)
                        if err := pc.SetRemoteDescription(offer); err != nil {
                                log.Printf("❌ Client %s - Set remote desc error: %v", clientID, err)
                                continue
                        }
                        log.Printf("✅ Client %s - Remote description set", clientID)
                        
                        log.Printf("🔧 Client %s - Creating answer", clientID)
                        answer, err := pc.CreateAnswer(nil)
                        if err != nil {
                                log.Printf("❌ Client %s - Create answer error: %v", clientID, err)
                                continue
                        }
                        log.Printf("✅ Client %s - Answer created", clientID)
                        
                        log.Printf("🔧 Client %s - Setting local description (answer)", clientID)
                        if err := pc.SetLocalDescription(answer); err != nil {
                                log.Printf("❌ Client %s - Set local desc error: %v", clientID, err)
                                continue
                        }
                        log.Printf("✅ Client %s - Local description set", clientID)
                        
                        log.Printf("📤 Client %s - Sending answer to client", clientID)
                        conn.WriteJSON(map[string]interface{}{
                                "type": "answer",
                                "data": answer,
                        })
                        log.Printf("✅ Client %s - Answer sent", clientID)
                        
                case "answer":
                        log.Printf("⚠️ Client %s - Received ANSWER (unexpected - server should send offers)", clientID)
                        answer := webrtc.SessionDescription{}
                        answerData, _ := json.Marshal(msg["data"])
                        if err := json.Unmarshal(answerData, &answer); err != nil {
                                log.Printf("❌ Client %s - Failed to unmarshal answer: %v", clientID, err)
                                continue
                        }
                        if err := pc.SetRemoteDescription(answer); err != nil {
                                log.Printf("❌ Client %s - Set remote desc error: %v", clientID, err)
                        }
                        
                case "candidate":
                        candidate := webrtc.ICECandidateInit{}
                        candidateData, _ := json.Marshal(msg["data"])
                        if err := json.Unmarshal(candidateData, &candidate); err != nil {
                                log.Printf("❌ Client %s - Failed to unmarshal candidate: %v", clientID, err)
                                continue
                        }
                        log.Printf("📥 Client %s - Adding ICE candidate", clientID)
                        if err := pc.AddICECandidate(candidate); err != nil {
                                log.Printf("❌ Client %s - Add ICE candidate error: %v", clientID, err)
                        } else {
                                log.Printf("✅ Client %s - ICE candidate added", clientID)
                        }
                }
        }
        
        log.Printf("=== HANDLE CONNECTION END === Client: %s", clientID)
}

func main() {
        rooms := make(map[string]*Room)
        var roomsMu sync.RWMutex
        clientCounter := 0
        var counterMu sync.Mutex

        http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
                roomID := r.URL.Query().Get("room")
                if roomID == "" {
                        roomID = "default"
                }
                
                counterMu.Lock()
                clientCounter++
                clientID := fmt.Sprintf("client-%d", clientCounter)
                counterMu.Unlock()
                
                log.Printf("🔗 New connection: Client %s joining room: %s", clientID, roomID)
                
                roomsMu.Lock()
                if rooms[roomID] == nil {
                        rooms[roomID] = newRoom(roomID)
                }
                room := rooms[roomID]
                roomsMu.Unlock()
                
                conn, err := upgrader.Upgrade(w, r, nil)
                if err != nil {
                        log.Printf("❌ Upgrade error for client %s: %v", clientID, err)
                        return
                }
                log.Printf("✅ WebSocket upgraded for client %s", clientID)
                
                go handleConnection(room, conn, clientID)
        })
        
        log.Println("🚀 SFU server starting on :8080")
        log.Fatal(http.ListenAndServe(":8080", nil))
}
