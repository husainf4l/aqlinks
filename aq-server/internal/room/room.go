package room

import (
	"sync"

	"aq-server/internal/types"
)

// Room represents a video conference room
type Room struct {
	ID    string
	Peers map[*types.ThreadSafeWriter]*types.PeerConnectionState
	mu    sync.RWMutex
}

// RoomManager manages all rooms
type RoomManager struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

// NewRoomManager creates a new room manager
func NewRoomManager() *RoomManager {
	return &RoomManager{
		rooms: make(map[string]*Room),
	}
}

// GetOrCreateRoom gets an existing room or creates a new one
func (rm *RoomManager) GetOrCreateRoom(roomID string) *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, exists := rm.rooms[roomID]; exists {
		return room
	}

	room := &Room{
		ID:    roomID,
		Peers: make(map[*types.ThreadSafeWriter]*types.PeerConnectionState),
	}
	rm.rooms[roomID] = room
	return room
}

// GetRoom gets a room by ID, returns nil if not found
func (rm *RoomManager) GetRoom(roomID string) *Room {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	return rm.rooms[roomID]
}

// AddPeer adds a peer to a room
func (rm *RoomManager) AddPeer(roomID string, ws *types.ThreadSafeWriter, pc *types.PeerConnectionState) {
	room := rm.GetOrCreateRoom(roomID)
	room.mu.Lock()
	defer room.mu.Unlock()

	room.Peers[ws] = pc
}

// RemovePeer removes a peer from a room
func (rm *RoomManager) RemovePeer(roomID string, ws *types.ThreadSafeWriter) {
	room := rm.GetRoom(roomID)
	if room == nil {
		return
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	delete(room.Peers, ws)

	// Delete room if empty
	if len(room.Peers) == 0 {
		rm.mu.Lock()
		defer rm.mu.Unlock()
		delete(rm.rooms, roomID)
	}
}

// GetPeersInRoom returns all peers in a room (excluding the caller if provided)
func (rm *RoomManager) GetPeersInRoom(roomID string, excludeWS *types.ThreadSafeWriter) []*types.PeerConnectionState {
	room := rm.GetRoom(roomID)
	if room == nil {
		return []*types.PeerConnectionState{}
	}

	room.mu.RLock()
	defer room.mu.RUnlock()

	peers := make([]*types.PeerConnectionState, 0, len(room.Peers))
	for ws, pc := range room.Peers {
		if excludeWS != nil && ws == excludeWS {
			continue
		}
		peers = append(peers, pc)
	}

	return peers
}

// GetRoomPeerCount returns the number of peers in a room
func (rm *RoomManager) GetRoomPeerCount(roomID string) int {
	room := rm.GetRoom(roomID)
	if room == nil {
		return 0
	}

	room.mu.RLock()
	defer room.mu.RUnlock()

	return len(room.Peers)
}

// GetAllRooms returns info about all active rooms
func (rm *RoomManager) GetAllRooms() map[string]int {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	result := make(map[string]int)
	for id, room := range rm.rooms {
		room.mu.RLock()
		result[id] = len(room.Peers)
		room.mu.RUnlock()
	}

	return result
}
