package sfu

import (
	"encoding/json"
	"sync"
	"time"

	"aq-server/internal/room"
	"aq-server/internal/types"
	"github.com/pion/logging"
	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"
)

// SFUContext holds the state needed by SFU functions
type SFUContext struct {
	Logger          logging.LeveledLogger
	ListLock        sync.RWMutex
	PeerConnections *[]types.PeerConnectionState
	TrackLocals     *map[string]*webrtc.TrackLocalStaticRTP
	RoomManager     *room.RoomManager // New: room management
}

var sfuCtx *SFUContext

// InitContext initializes the SFU context
func InitContext(ctx *SFUContext) {
	sfuCtx = ctx
}

// GetPeerCount returns the number of active peer connections
func GetPeerCount() int {
	if sfuCtx == nil {
		return 0
	}

	sfuCtx.ListLock.RLock()
	defer sfuCtx.ListLock.RUnlock()

	return len(*sfuCtx.PeerConnections)
}

// DispatchKeyFrame sends a keyframe to all PeerConnections, used everytime a new user joins the call.
func DispatchKeyFrame() {
	if sfuCtx == nil {
		return
	}

	sfuCtx.ListLock.Lock()
	defer sfuCtx.ListLock.Unlock()

	// Safety check: return if no peers
	if len(*sfuCtx.PeerConnections) == 0 {
		return
	}

	for i := range *sfuCtx.PeerConnections {
		for _, receiver := range (*sfuCtx.PeerConnections)[i].PeerConnection.GetReceivers() {
			if receiver.Track() == nil {
				continue
			}

			_ = (*sfuCtx.PeerConnections)[i].PeerConnection.WriteRTCP([]rtcp.Packet{
				&rtcp.PictureLossIndication{
					MediaSSRC: uint32(receiver.Track().SSRC()),
				},
			})
		}
	}
}

// AddTrack adds a track to the list and fires renegotiation for all PeerConnections.
func AddTrack(t *webrtc.TrackRemote) *webrtc.TrackLocalStaticRTP { // nolint
	if sfuCtx == nil {
		return nil
	}

	sfuCtx.ListLock.Lock()
	defer func() {
		sfuCtx.ListLock.Unlock()
		SignalPeerConnections()
	}()

	// Create a new TrackLocal with the same codec as our incoming
	trackLocal, err := webrtc.NewTrackLocalStaticRTP(t.Codec().RTPCodecCapability, t.ID(), t.StreamID())
	if err != nil {
		sfuCtx.Logger.Errorf("Failed to create TrackLocal: %v", err)
		return nil // Return nil instead of panicking
	}

	(*sfuCtx.TrackLocals)[t.ID()] = trackLocal

	return trackLocal
}

// RemoveTrack removes a track from the list and fires renegotiation for all PeerConnections.
func RemoveTrack(t *webrtc.TrackLocalStaticRTP) {
	if sfuCtx == nil {
		return
	}

	sfuCtx.ListLock.Lock()
	defer func() {
		sfuCtx.ListLock.Unlock()
		SignalPeerConnections()
	}()

	delete(*sfuCtx.TrackLocals, t.ID())
}

// SignalPeerConnections updates each PeerConnection so that it is getting all the expected media tracks.
func SignalPeerConnections() { // nolint
	if sfuCtx == nil {
		return
	}

	sfuCtx.ListLock.Lock()
	defer func() {
		sfuCtx.ListLock.Unlock()
		DispatchKeyFrame()
	}()

	attemptSync := func() (tryAgain bool) {
		// Use index-based loop with bounds checking to safely remove elements
		for i := 0; i < len(*sfuCtx.PeerConnections); {
			currentPeer := (*sfuCtx.PeerConnections)[i]
			
			if currentPeer.PeerConnection.ConnectionState() == webrtc.PeerConnectionStateClosed {
				// Remove closed connection and restart from beginning
				*sfuCtx.PeerConnections = append((*sfuCtx.PeerConnections)[:i], (*sfuCtx.PeerConnections)[i+1:]...)
				return true // We modified the slice, start from the beginning
			}

			// map of sender we already are sending, so we don't double send
			existingSenders := map[string]bool{}

			for _, sender := range currentPeer.PeerConnection.GetSenders() {
				if sender.Track() == nil {
					continue
				}

				existingSenders[sender.Track().ID()] = true

				// If we have a RTPSender that doesn't map to an existing track, remove it
				if _, ok := (*sfuCtx.TrackLocals)[sender.Track().ID()]; !ok {
					if err := currentPeer.PeerConnection.RemoveTrack(sender); err != nil {
						sfuCtx.Logger.Errorf("Failed to remove track: %v", err)
						return true
					}
				}
			}

			// Don't receive videos we are sending, make sure we don't have loopback
			for _, receiver := range currentPeer.PeerConnection.GetReceivers() {
				if receiver.Track() == nil {
					continue
				}

				existingSenders[receiver.Track().ID()] = true
			}

			// Add all tracks from peers in the SAME ROOM
			// Only add tracks if there are other peers in the same room
			var hasRoomPeers bool
			if sfuCtx.RoomManager != nil {
				roomPeerCount := sfuCtx.RoomManager.GetRoomPeerCount(currentPeer.RoomID)
				hasRoomPeers = roomPeerCount > 1 // More than just this peer
			} else {
				// Fallback: use all peers if no room manager (backward compatibility)
				for j := range *sfuCtx.PeerConnections {
					if (*sfuCtx.PeerConnections)[j].Websocket != currentPeer.Websocket {
						hasRoomPeers = true
						break
					}
				}
			}

			// Add tracks if there are other peers in the room
			if hasRoomPeers {
				for trackID, track := range *sfuCtx.TrackLocals {
					if _, ok := existingSenders[trackID]; !ok {
						// Add track
						if _, err := currentPeer.PeerConnection.AddTrack(track); err != nil {
							sfuCtx.Logger.Debugf("Failed to add track: %v", err)
							return true
						}
						existingSenders[trackID] = true
					}
				}
			}

			// Only create offer if signaling state is stable
			// (can't create offer if we're waiting for answer to previous offer)
			if currentPeer.PeerConnection.SignalingState() != webrtc.SignalingStateStable {
				// Skip this peer, it's in the middle of an offer/answer exchange
				i++
				continue
			}

			// Create and send offer
			offer, err := currentPeer.PeerConnection.CreateOffer(nil)
			if err != nil {
				sfuCtx.Logger.Errorf("Failed to create offer: %v", err)
				return true
			}

			if err = currentPeer.PeerConnection.SetLocalDescription(offer); err != nil {
				sfuCtx.Logger.Errorf("Failed to set local description: %v", err)
				return true
			}

			offerString, err := json.Marshal(offer)
			if err != nil {
				sfuCtx.Logger.Errorf("Failed to marshal offer to json: %v", err)
				return true
			}

			if err = currentPeer.Websocket.WriteJSON(&types.WebsocketMessage{
				Event: "offer",
				Data:  string(offerString),
			}); err != nil {
				sfuCtx.Logger.Errorf("Failed to write offer: %v", err)
				return true
			}

			i++ // Only increment if we didn't remove the element
		}

		return tryAgain
	}

	for syncAttempt := 0; ; syncAttempt++ {
		if syncAttempt == 25 {
			// Release the lock and attempt a sync in 3 seconds. We might be blocking a RemoveTrack or AddTrack
			go func() {
				time.Sleep(time.Second * 3)
				SignalPeerConnections()
			}()

			return
		}

		if !attemptSync() {
			break
		}
	}
}

// BroadcastChat sends a chat message to all connected peers in the same room.
func BroadcastChat(msg types.ChatMessage, sender *types.ThreadSafeWriter) {
	if sfuCtx == nil {
		return
	}

	sfuCtx.ListLock.RLock()
	defer sfuCtx.ListLock.RUnlock()

	// Find the sender's room
	var senderRoom string
	for i := range *sfuCtx.PeerConnections {
		if (*sfuCtx.PeerConnections)[i].Websocket == sender {
			senderRoom = (*sfuCtx.PeerConnections)[i].RoomID
			break
		}
	}

	// Broadcast only to peers in the same room
	for i := range *sfuCtx.PeerConnections {
		peer := (*sfuCtx.PeerConnections)[i]
		
		// Don't send the message back to the sender
		if peer.Websocket == sender {
			continue
		}

		// Only send to peers in the same room
		if peer.RoomID != senderRoom {
			continue
		}

		if err := peer.Websocket.WriteJSON(msg); err != nil {
			sfuCtx.Logger.Errorf("Failed to send chat message: %v", err)
		}
	}
}
