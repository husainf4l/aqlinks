# Room Usage Guide: Before & After Tokens

## Quick Reference

### BEFORE TOKENS (Phase 1-4)
```bash
# Direct URL access
http://localhost:8080/?room=my-room&username=alice

# Join without any setup
# Instant room creation
# No authentication
```

### AFTER TOKENS (Phase 5+, Current)
```bash
# Step 1: Generate token via API
curl -X POST http://localhost:8080/api/v1/tokens \
  -H "Authorization: Bearer pk_test_company" \
  -H "Content-Type: application/json" \
  -d '{
    "room_id": "my-room",
    "user_name": "alice",
    "duration": 3600
  }'

# Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-10-21T18:21:27Z",
  "room_id": "my-room",
  "user_name": "alice"
}

# Step 2: Use token to connect
ws://localhost:8080/ws?token=eyJhbGciOiJIUzI1NiIs...&room=my-room&username=alice
```

---

## Phase-by-Phase Examples

### Phase 1-2: Basic Room Support

#### Feature: Join any room instantly
```javascript
// User visits URL with room params
const url = `http://localhost:8080/?room=team-123&username=john`

// JavaScript automatically:
// 1. Extracts room=team-123, username=john
// 2. Connects WebSocket to same room
// 3. Only sees video from others in team-123

// Result:
// ✅ Isolated video streams
// ✅ No authentication needed
// ❌ Anyone can join any room
// ❌ No audit trail
```

### Phase 3: Frontend Modal

#### Feature: Modal for room selection
```javascript
// Show modal if no room in URL
if (!urlParams.room) {
    showRoomModal()
}

// User enters:
// - Room ID: "team-meeting"
// - Name: "Alice"

// Modal hides, WebSocket connects to:
// ws://localhost:8080/ws?room=team-meeting&username=Alice
```

### Phase 4: Database Persistence

#### Feature: Create persistent rooms
```bash
# Via REST API
curl -X POST http://localhost:8080/api/v1/rooms \
  -H "Authorization: Bearer <token>" \
  -d '{
    "room_id": "team-meeting",
    "name": "Q4 Planning",
    "description": "Quarterly planning meeting",
    "max_participants": 50
  }'

# Result:
# ✅ Room stored in database
# ✅ Metadata persists
# ✅ Sessions recorded
# ✅ Analytics available
```

### Phase 5-7: Token-Based Access

#### Scenario 1: Web App Integration
```
1. User logs into app at app.com
   └─ Backend generates secure token via /api/v1/tokens
   
2. Frontend embeds token in WebSocket URL
   └─ No exposing API keys to client
   
3. Server validates token signature
   └─ Ensures request came from authorized backend
   
4. User enters room with full audit trail
```

#### Scenario 2: Direct URL (for demos)
```javascript
// Still works but insecure:
ws://localhost:8080/ws?room=demo&username=user

// Better approach:
// Redirect to token endpoint first
```

---

## Database Schema Evolution

### Before Phase 4
```
IN-MEMORY ONLY
├─ RoomManager: map[roomID] → Room
└─ Room: map[websocket] → PeerState

Limitations:
❌ Lost on server restart
❌ No analytics
❌ No session tracking
❌ No audit
```

### Phase 4+ (Current)
```
POSTGRESQL DATABASE

companies
├─ id (UUID)
├─ name (varchar)
├─ api_key
├─ secret_key
└─ tier (free|pro|enterprise)

rooms
├─ id (UUID)
├─ company_id (FK)
├─ room_id (user-friendly ID)
├─ name
├─ description
├─ max_participants
├─ created_at
└─ metadata (JSONB)

tokens
├─ id (UUID)
├─ company_id (FK)
├─ token_hash
├─ room_id
├─ user_name
├─ expires_at
├─ is_used
├─ revoked
└─ permissions (JSONB)

sessions
├─ id (UUID)
├─ company_id (FK)
├─ room_id
├─ user_name
├─ token_id (FK)
├─ connected_at
├─ disconnected_at
└─ peer_address
```

---

## Real-World Use Cases

### Use Case 1: Public Demo Room (Phase 2-3)

**Scenario**: Anyone can join the demo
```
Before Tokens:
┌─────────────────────────────────────┐
│ Demo Website                         │
├─────────────────────────────────────┤
│ <button onclick="joinDemo()">       │
│   Join Demo Meeting                 │
│ </button>                           │
│                                     │
│ function joinDemo() {               │
│   window.location =                 │
│   'http://localhost:8080/' +       │
│   '?room=public-demo' +            │
│   '&username=' + prompt('Name?')   │
│ }                                   │
└─────────────────────────────────────┘

✅ Instant access
❌ No rate limiting
❌ No usage tracking
❌ Anyone can spam rooms
```

### Use Case 2: Enterprise Meeting Room (Phase 5+)

**Scenario**: Scheduled meeting with authentication
```
After Tokens:

1. Admin schedules meeting
   └─ Creates room via /api/v1/rooms
   └─ Sets max_participants: 20

2. Employee logs in to company app
   └─ App backend calls /api/v1/tokens
   └─ Returns time-limited token (expires in 1 hour)

3. Employee clicks "Join Meeting"
   └─ Frontend uses token to connect WebSocket
   └─ Backend validates token:
      ├─ Signature valid?
      ├─ Not expired?
      ├─ Not revoked?
      └─ Room exists?
      
4. Session created in database
   └─ connected_at: timestamp
   └─ user_name: employee email
   └─ company_id: tracked for billing

5. Meeting ends
   └─ Session closed: disconnected_at set
   └─ Duration calculated automatically
   └─ Used for analytics/billing

✅ Secure authentication
✅ Usage tracking
✅ Time-limited access
✅ Audit trail
✅ Per-company isolation
✅ Billing integration
```

### Use Case 3: Multi-Tenant SaaS (Phase 5+)

**Scenario**: Multiple companies using same server
```
Database Structure:
┌──────────────────────────────┐
│ Company A (acme.com)         │
├──────────────────────────────┤
│ API Key: pk_acme_abc123      │
│ Secret:  sk_acme_xyz789      │
│ Rooms:                       │
│  ├─ sales-team               │
│  ├─ engineering              │
│  └─ all-hands                │
│ Sessions: 150 (this month)   │
│ Usage: $150/month            │
└──────────────────────────────┘

┌──────────────────────────────┐
│ Company B (startup.io)       │
├──────────────────────────────┤
│ API Key: pk_startup_def456   │
│ Secret:  sk_startup_uvw012   │
│ Rooms:                       │
│  ├─ standup                  │
│  ├─ hiring-interviews        │
│  └─ product-demo             │
│ Sessions: 45 (this month)    │
│ Usage: $45/month             │
└──────────────────────────────┘

Data Isolation:
├─ Company A cannot access Company B's:
│  ├─ Rooms
│  ├─ Sessions
│  ├─ Tokens
│  └─ API Keys
│
└─ All queries filtered by company_id
```

---

## API Endpoints Comparison

### Phase 2-4 Endpoints
```
GET    / (serves HTML)
GET    /health
GET    /metrics
GET    /ws (WebSocket upgrade)
POST   /ws (WebSocket upgrade)
```

### Phase 5+ Endpoints (Added)
```
POST   /api/v1/tokens              (Generate access token)
GET    /api/v1/rooms               (List all rooms)
POST   /api/v1/rooms               (Create room)
GET    /api/v1/rooms/:roomId       (Get room details)
PUT    /api/v1/rooms/:roomId       (Update room)
DELETE /api/v1/rooms/:roomId       (Delete room)
```

---

## Migration Guide: Phase 2 → Phase 5

### Step 1: Enable Backward Compatibility
```go
// In WebSocket handler
if token := r.URL.Query().Get("token"); token != "" {
    // NEW: Validate JWT token
    claims, err := ValidateToken(token, secretKey)
    if err != nil {
        return httpError("Invalid token")
    }
    roomID = claims.RoomID
    username = claims.Username
} else if room := r.URL.Query().Get("room"); room != "" {
    // OLD: Direct room access (deprecated)
    log.Warn("Direct room access is deprecated, use token-based auth")
    roomID = room
    username = r.URL.Query().Get("username")
}
```

### Step 2: Add Token Generation
```
POST /api/v1/tokens
Authorization: Bearer <api_key>
{
    "room_id": "my-room",
    "user_name": "alice",
    "duration": 3600
}
```

### Step 3: Update Frontend
```javascript
// Old way (still works but deprecated)
ws = new WebSocket(`ws://localhost:8080/ws?room=foo&username=bar`)

// New way (recommended)
const response = await fetch('/api/v1/tokens', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer pk_test_company',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        room_id: 'foo',
        user_name: 'bar',
        duration: 3600
    })
})
const { token } = await response.json()
ws = new WebSocket(`ws://localhost:8080/ws?token=${token}&room=foo&username=bar`)
```

### Step 4: Test Both Methods
```bash
# Old method still works:
curl http://localhost:8080/?room=test&username=user

# New method:
curl -X POST http://localhost:8080/api/v1/tokens \
  -H "Authorization: Bearer pk_test_company" \
  -d '{"room_id":"test","user_name":"user","duration":3600}'
```

---

## Performance Implications

### Phase 2-4 (In-Memory Only)
```
Peer Lookup:    O(n) - scan all peers
Track Broadcast: O(n*m) - n peers × m tracks
Memory:         ~1KB per peer
Restart Impact: All peers disconnected
```

### Phase 5+ (Database + In-Memory)
```
Peer Lookup:    O(1) - in-memory hash
Track Broadcast: O(n*m) - same, but faster starts
Memory:         ~1.5KB per peer (token state)
Restart Impact: Peers reconnect, history preserved
Queries:        Indexed on (company_id, room_id)
```

---

## Security Improvements

### Phase 2-4
```
❌ No authentication
❌ No rate limiting
❌ Anyone can guess room IDs
❌ No audit trail
❌ No usage tracking
❌ No revocation mechanism
```

### Phase 5+ (Current)
```
✅ JWT token-based auth
✅ API key validation
✅ Token expiration
✅ Token revocation
✅ Multi-tenant isolation
✅ Full audit trail
✅ Rate limiting ready
✅ Permission-based access
✅ Hash token storage (never plain text)
✅ Company-level isolation
```

---

## Token Security Details

### Token Structure
```json
{
  "alg": "HS256",
  "typ": "JWT",
  "iss": "aq-server",
  "aud": "webrtc",
  "sub": "<user_id>",
  "company_id": "test-company",
  "room_id": "meeting-123",
  "user_name": "alice",
  "iat": 1729611687,
  "exp": 1729615287
}
```

### Signature Validation
```
Token = Header.Payload.Signature
Signature = HMAC_SHA256(Header.Payload, secret_key)

Server validates:
1. Signature (prevents tampering)
2. Expiration (time-based revocation)
3. Issuer (server-generated only)
4. Company (multi-tenant check)
```

### Storage
```
Frontend:  Never stored, used immediately
Server:    Hashed token stored, plain JWT never saved
Database:  Hash-only in tokens table
Audit:     Token_id reference in sessions table
```

---

## Troubleshooting

### Issue: Rooms Not Showing in Database
```
Solution (Phase 5+):
1. Check if using in-memory only (Phase 2-4)
2. Run migrations: /migrations/001_create_schema.sql
3. Verify database connection in config
4. Rooms created in memory, not DB (expected)
```

### Issue: Token Expired Too Quickly
```
Solution:
1. Increase duration in token request: "duration": 86400 (24 hours)
2. Check server time sync: NTP
3. Verify secret_key is same in all instances
```

### Issue: Cross-Room Video Visibility
```
Solution (Phase 5+):
1. Verify peer in correct room: peer.RoomID
2. Check RoomManager.GetRoomPeerCount()
3. Ensure SignalPeerConnections() filters by room
```

---

## Summary Table

| Feature | Phase 2-4 | Phase 5+ |
|---------|-----------|----------|
| **Join Room** | URL params | Token required |
| **Auth** | None | API Key → JWT |
| **Storage** | In-memory | Database |
| **Multi-tenant** | No | Yes |
| **Audit** | No | Yes |
| **Rate limit** | No | Ready |
| **TTL Control** | No | Yes |
| **Revocation** | No | Yes |
| **Analytics** | No | Yes |
| **Billing** | No | Ready |

