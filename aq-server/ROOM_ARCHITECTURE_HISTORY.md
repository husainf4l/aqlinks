# Room Architecture History

## Timeline Overview

```
Initial Version (No Rooms)
    ↓ (Commit 65e0b35)
Room-Based Management System (In-Memory Rooms)
    ↓ (Commit 1d4e45f)
Frontend Room Support (HTML Modal)
    ↓ (Commit 004436d)
GORM ORM with Database Persistence
    ↓ (Commit aaa1f38)
Production REST API with Fiber
    ↓ (Commit 5deba39)
Complete REST API with Fiber and nginx routing
    ↓ (Commit a5bb60f)
Refactor to net/http + negroni (Current)
```

---

## Phase 1: Initial Version (Before Rooms)

### Features
- Single global peer connection list
- All clients shared the same video stream
- No room isolation
- Simple query parameters for room/username (ignored)

### WebSocket URL Format
```
ws://localhost:8080/ws
```

### Data Structure (in-memory)
```go
// App struct
type App struct {
    peerConnections []types.PeerConnectionState  // All peers globally
    trackLocals     map[string]*webrtc.TrackLocalStaticRTP
}

// No room differentiation
// All tracks broadcasted to all peers
```

### Video Flow
```
Peer A Stream → All Peers (B, C, D) in Broadcast
Peer B Stream → All Peers (A, C, D) in Broadcast
Peer C Stream → All Peers (A, B, D) in Broadcast
```

---

## Phase 2: Room-Based Management System (Commit 65e0b35)

### Key Changes
- **Introduced RoomManager** for organizing peers by room
- **In-memory room persistence** (ephemeral, lost on restart)
- **Room isolation** - only peers in same room see each other's video
- **Query parameter validation** - room and username parameters now used

### New Data Structures
```go
// Room represents a video conference room
type Room struct {
    ID    string
    Peers map[*ThreadSafeWriter]*PeerConnectionState  // Peers in this room
    mu    sync.RWMutex
}

// RoomManager manages all rooms
type RoomManager struct {
    rooms map[string]*Room  // Map of room_id → Room
    mu    sync.RWMutex
}

// Updated PeerConnectionState
type PeerConnectionState struct {
    PeerConnection *webrtc.PeerConnection
    Websocket      *ThreadSafeWriter
    Username       string     // NEW
    RoomID         string     // NEW
}
```

### WebSocket URL Format (Same, but now used)
```
ws://localhost:8080/ws?room=room123&username=john
```

### Video Flow (Isolated by Room)
```
Room A:
  Peer A → Peer B, Peer C (only in Room A)
  
Room B:
  Peer D → Peer E (only in Room B)
  
Peers in different rooms NEVER see each other
```

### Implementation Details
```go
// Extract room from query params
roomID := r.URL.Query().Get("room")
if roomID == "" {
    roomID = "default"
}

// Add peer to room
handlerCtx.RoomManager.AddPeer(roomID, c, &peerConnectionState)

// Only signal peers in same room
func SignalPeerConnections() {
    for _, peer := range peerConnections {
        roomPeerCount := RoomManager.GetRoomPeerCount(peer.RoomID)
        if roomPeerCount > 1 {  // Only if other peers in room
            addTracksAndCreateOffer()
        }
    }
}
```

---

## Phase 3: Frontend Room Support (Commit 1d4e45f)

### Key Changes
- **Room selection modal** in HTML UI
- **Manual room/username entry** before joining
- **URL parameter support** for direct room joins
- **Chat integrated per-room**

### UI Features
```html
<!-- Room Selection Modal -->
<input id="roomInput" placeholder="e.g., room-123">
<input id="usernameInput" placeholder="Enter your name">
<button id="joinBtn">Join Room</button>

<!-- Room Badge Display -->
<div id="roomBadge">
  📍 room-123 | 👤 john
</div>
```

### JavaScript Logic
```javascript
// Extract from URL or show modal
const urlParams = new URLSearchParams(window.location.search)
const room = urlParams.get('room') || 'default'
const username = urlParams.get('username') || 'User'

// Update WebSocket URL
wsUrl = `ws://localhost:8080/ws?room=${room}&username=${username}`
```

### Usage Examples
```
Direct: http://localhost:8080/?room=team-meeting&username=alice
Modal:  http://localhost:8080/ (shows selection modal)
```

---

## Phase 4: Database Persistence (Commit 004436d)

### Key Changes
- **GORM ORM** for database abstraction
- **PostgreSQL** for persistent storage
- **Room metadata storage** (name, description, max_participants)
- **Session tracking** (who joined when)

### New Database Schema
```sql
-- Rooms Table
CREATE TABLE rooms (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL,
    room_id VARCHAR(255) NOT NULL,      -- Unique room identifier
    name VARCHAR(255),
    description TEXT,
    max_participants INT DEFAULT 100,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Sessions Table (Track room usage)
CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL,
    room_id VARCHAR(255) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    token_id UUID,
    connected_at TIMESTAMP,
    disconnected_at TIMESTAMP,
    peer_address VARCHAR(100)
);
```

### Go Data Models
```go
type Room struct {
    ID              string         // UUID
    CompanyID       string         // Tenant ID
    RoomID          string         // User-friendly ID (e.g., "team-meeting")
    Name            string
    Description     string
    MaxParticipants int
    CreatedAt       time.Time
    UpdatedAt       time.Time
    Metadata        datatypes.JSON
}

type Session struct {
    ID              string
    CompanyID       string
    RoomID          string
    UserName        string
    TokenID         *string
    ConnectedAt     time.Time
    DisconnectedAt  *time.Time
    PeerAddress     string
    Metadata        datatypes.JSON
}
```

### In-Memory vs Database
```
IN-MEMORY (RoomManager):
├─ Quick access for active streams
├─ Fast peer lookup during signaling
└─ Lost on server restart

DATABASE:
├─ Persistent room metadata
├─ Session history/analytics
├─ Audit trail
└─ Multi-tenant isolation
```

---

## Phase 5: Production REST API (Commit aaa1f38)

### New Endpoints (Fiber-based)

#### Token Generation (Public)
```
POST /api/v1/tokens
Content-Type: application/json
Authorization: Bearer pk_test_company

{
    "room_id": "team-meeting",
    "user_name": "alice",
    "duration": 3600
}

Response:
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_at": "2025-10-21T18:21:27Z",
    "room_id": "team-meeting",
    "user_name": "alice"
}
```

#### Room Management (Protected)
```
GET    /api/v1/rooms                    # List all rooms
POST   /api/v1/rooms                    # Create room
GET    /api/v1/rooms/:roomId            # Get room details
PUT    /api/v1/rooms/:roomId            # Update room
DELETE /api/v1/rooms/:roomId            # Delete room
```

### Authentication Flow
```
1. Client gets API Key (shared with backend)
2. Client calls /api/v1/tokens with API Key
3. Server validates API Key → generates JWT token
4. Client uses JWT token to connect WebSocket:
   ws://localhost:8080/ws?token=<jwt>&room=...&username=...
```

### New Data Models
```go
type Token struct {
    ID          string
    CompanyID   string
    TokenHash   string           // Hashed for security
    RoomID      string
    UserName    string
    Permissions datatypes.JSON   // {"publish": true, "subscribe": true}
    CreatedAt   time.Time
    ExpiresAt   time.Time
    IsUsed      bool
    UsedAt      *time.Time
    Revoked     bool
}

type Company struct {
    ID        string
    Name      string
    APIKey    string             // Public API Key
    SecretKey string             // Secret for token generation
    Tier      string             // free, pro, enterprise
    IsActive  bool
    CreatedAt time.Time
}
```

---

## Phase 6: WebSocket with Token Validation

### WebSocket Connection
```
// Before (Simple)
ws://localhost:8080/ws?room=team-meeting&username=alice

// After (Token-based)
ws://localhost:8080/ws?token=eyJhbGciOiJIUzI1NiIs...&room=team-meeting&username=alice
```

### Token Validation Flow
```
Client WebSocket Request
    ↓
Extract token from query params
    ↓
Verify JWT signature (using company's secret key)
    ↓
Extract claims: {company_id, room_id, user_name, exp}
    ↓
Validate: not expired, not revoked
    ↓
Connect to room with validated identity
    ↓
Create session record in database
```

### Connection Sequence
```go
// In WebSocket handler
token := r.URL.Query().Get("token")
roomID := r.URL.Query().Get("room")
username := r.URL.Query().Get("username")

// Validate token
claims, err := ValidateToken(token, secretKey)
if err != nil {
    // Reject connection
    return
}

// Add to room
roomManager.AddPeer(roomID, ws, &PeerConnectionState{
    Username: claims.Username,
    RoomID:   claims.RoomID,
})

// Create session record
CreateSession(&Session{
    CompanyID: claims.CompanyID,
    RoomID:    roomID,
    UserName:  username,
    TokenID:   &claims.TokenID,
    ConnectedAt: time.Now(),
})
```

---

## Phase 7: Current Architecture (net/http + negroni)

### Key Changes from Fiber
- **Replaced Fiber with net/http** - lighter, standard library
- **Added negroni** - minimal middleware support
- **Same room logic** - room management unchanged
- **Improved performance** - better lock management in SFU

### Current WebSocket Implementation
```go
// File: internal/handlers/handlers.go
func WebsocketHandler(w http.ResponseWriter, r *http.Request) {
    // Extract room and username from query params
    roomID := r.URL.Query().Get("room")
    username := r.URL.Query().Get("username")
    
    // Upgrade HTTP to WebSocket
    unsafeConn, err := handlerCtx.Upgrader.Upgrade(w, r, nil)
    
    // Add to room manager
    handlerCtx.RoomManager.AddPeer(roomID, c, &peerConnectionState)
    
    // WebRTC signaling loop...
}
```

### API Routes (net/http style)
```go
// File: internal/api/routes.go
func SetupRoutes(mux *http.ServeMux) error {
    // Public: Token generation
    mux.HandleFunc("/api/v1/tokens", withAPIKeyAuth(GenerateTokenHandler))
    
    // Protected: Room management
    mux.HandleFunc("/api/v1/rooms", func(w http.ResponseWriter, r *http.Request) {
        withAuth(secretKey, func(w http.ResponseWriter, r *http.Request) {
            if r.Method == http.MethodGet {
                ListRoomsHandler(w, r)
            } else if r.Method == http.MethodPost {
                CreateRoomHandler(w, r)
            }
        })(w, r)
    })
}
```

---

## Room Access Patterns Comparison

### Pattern 1: Anonymous Room Access (Phase 1-2)
```
User directly accesses: http://localhost:8080/
Joins room: ?room=default&username=User
No authentication required
```

### Pattern 2: Direct Room Link (Phase 2-3)
```
User accesses: http://localhost:8080/?room=team-meeting&username=alice
No registration needed
Room isolation provided
```

### Pattern 3: Token-Based Access (Phase 5-7)
```
1. Backend generates token via: POST /api/v1/tokens
2. Token includes: room_id, user_name, company_id, expiry
3. Frontend uses token: ws://localhost:8080/ws?token=xyz...
4. Server validates token before accepting connection
5. Session recorded in database
```

---

## Multi-Room Support Matrix

| Feature | Phase 1 | Phase 2 | Phase 3 | Phase 5 | Phase 7 |
|---------|---------|---------|---------|---------|---------|
| Room Isolation | ❌ | ✅ | ✅ | ✅ | ✅ |
| Multiple Rooms | ❌ | ✅ | ✅ | ✅ | ✅ |
| In-Memory Mgmt | N/A | ✅ | ✅ | ✅ | ✅ |
| Database Persistence | ❌ | ❌ | ✅ | ✅ | ✅ |
| REST API | ❌ | ❌ | ❌ | ✅ | ✅ |
| Token-based Auth | ❌ | ❌ | ❌ | ✅ | ✅ |
| Multi-Tenant | ❌ | ❌ | ❌ | ✅ | ✅ |
| Session Tracking | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## Database Queries for Room Operations

### Get Room with Active Sessions
```sql
SELECT 
    r.room_id,
    r.name,
    COUNT(s.id) as active_participants
FROM rooms r
LEFT JOIN sessions s ON r.room_id = s.room_id 
    AND s.disconnected_at IS NULL
WHERE r.company_id = $1 AND r.room_id = $2
GROUP BY r.id, r.room_id, r.name;
```

### Get User's Active Rooms
```sql
SELECT DISTINCT
    r.room_id,
    r.name,
    COUNT(*) OVER (PARTITION BY r.room_id) as participant_count
FROM rooms r
JOIN sessions s ON r.room_id = s.room_id
WHERE r.company_id = $1
    AND s.user_name = $2
    AND s.disconnected_at IS NULL;
```

### Room Usage Analytics
```sql
SELECT 
    r.room_id,
    DATE(s.connected_at) as date,
    COUNT(DISTINCT s.user_name) as unique_users,
    COUNT(s.id) as total_sessions,
    AVG(EXTRACT(EPOCH FROM (s.disconnected_at - s.connected_at))) as avg_session_duration
FROM rooms r
LEFT JOIN sessions s ON r.room_id = s.room_id
WHERE r.company_id = $1
GROUP BY r.room_id, DATE(s.connected_at)
ORDER BY date DESC;
```

---

## Performance Characteristics by Phase

### Phase 1-2: Pure In-Memory
- **Lookup**: O(n) scan through all peers
- **Add Peer**: O(1)
- **Remove Peer**: O(n) to find and remove
- **Scalability**: ~1000 peers per server
- **Persistence**: None

### Phase 5-7: With Database
- **Lookup**: O(1) in-memory, O(log n) in database
- **Add Peer**: O(1) in-memory + O(log n) database write
- **Queries**: Indexed on (company_id, room_id)
- **Scalability**: ~10,000 peers across multiple servers
- **Persistence**: Full audit trail

---

## Migration Path

If upgrading from Phase 2 to Phase 5:

1. **Add database layer** (GORM + Postgres)
2. **Migrate existing rooms** to database
3. **Add token generation endpoint**
4. **Update frontend** to fetch tokens
5. **Update WebSocket handler** to validate tokens
6. **Keep backward compatibility** (optional)

```go
// Backward compat: accept both old and new style
if token := r.URL.Query().Get("token"); token != "" {
    // New: validate JWT token
} else if room := r.URL.Query().Get("room"); room != "" {
    // Old: direct room access (deprecated)
}
```

---

## Current Implementation Summary

**Current Phase**: 7 (net/http + negroni, all features)

**Room Access Methods**:
1. ✅ Direct: `ws://localhost:8080/ws?room=foo&username=bar` (if allowed)
2. ✅ Token-based: `ws://localhost:8080/ws?token=jwt`
3. ✅ REST API: CRUD operations on `/api/v1/rooms`

**Authentication Layers**:
1. API Key → Token Generation
2. JWT Token → WebSocket Connection
3. Multi-tenant isolation via Company ID

**Data Persistence**:
- Room metadata: Database
- Active peers: In-memory (RoomManager)
- Session history: Database
- Analytics: Database queries available

---

## Key Files Reference

| File | Phase Introduced | Purpose |
|------|------------------|---------|
| `internal/room/room.go` | 2 | RoomManager for peer isolation |
| `internal/database/models.go` | 4 | Room, Token, Session models |
| `internal/api/routes.go` | 5 | REST API endpoints |
| `internal/api/tokens.go` | 5 | Token generation logic |
| `internal/handlers/handlers.go` | 1 | WebSocket handler |
| `index.html` | 3 | Room selection UI |

