# WebRTC SFU Architecture Documentation

## Overview
This application implements a **Selective Forwarding Unit (SFU)** architecture for multi-party video conferencing using:
- **Frontend**: Next.js 15.5.6 + React 19 + WebRTC API
- **Backend**: Go + Pion WebRTC v3

## Architecture Compliance

### ✅ Next.js 15 Best Practices
- ✓ App Router structure (`/src/app`)
- ✓ Client Components with `'use client'` directive
- ✓ Server metadata API in `layout.tsx`
- ✓ React 19 hooks pattern (no class components)
- ✓ TypeScript strict mode
- ✓ Turbopack for development

### ✅ WebRTC API Standards (MDN)
- ✓ Standard `addTrack()` method (not deprecated APIs)
- ✓ RTCPeerConnection with proper ICE servers
- ✓ ICE candidate queueing before remote description
- ✓ `ontrack` event handling for remote streams
- ✓ `onicecandidate` for ICE exchange
- ✓ `onconnectionstatechange` for connection monitoring
- ✓ `onnegotiationneeded` handler (informational in SFU)
- ✓ Proper SDP offer/answer exchange
- ✓ MediaStream API for getUserMedia

### ✅ Pion WebRTC v3 Best Practices
- ✓ `AddTransceiverFromKind` with `RTPTransceiverDirectionRecvonly`
- ✓ `TrackLocalStaticRTP` for media forwarding
- ✓ **CRITICAL: RTCP packet reading** (prevents memory leaks)
- ✓ OnTrack handler for receiving media
- ✓ Proper goroutine management for RTP/RTCP
- ✓ MediaEngine with default codecs
- ✓ SettingEngine for network configuration
- ✓ Mutex protection for signaling state
- ✓ Proper cleanup and connection closure

## SFU Message Flow

```
1. Client → Server: WebSocket Connection
   └─ wss://aqlaan.com/ws?room=<roomName>

2. Server: Create PeerConnection
   ├─ AddTransceiverFromKind(audio, recvonly)
   ├─ AddTransceiverFromKind(video, recvonly)
   └─ Setup handlers (OnTrack, OnICECandidate, etc.)

3. Server → Client: Initial Offer (SDP)
   └─ Contains server's recvonly transceivers

4. Client: Create PeerConnection
   ├─ Add local tracks using addTrack()
   │  └─ Automatically creates sendrecv transceivers
   └─ Set remote description (server's offer)

5. Client → Server: Answer (SDP)
   └─ Contains client's tracks in SDP

6. ICE Exchange (Bidirectional)
   ├─ Client → Server: ICE candidates
   └─ Server → Client: ICE candidates

7. Connection Established
   └─ ICE state: checking → connected

8. Server: OnTrack Fires
   ├─ Create TrackLocalStaticRTP
   ├─ Start RTP forwarding goroutine
   ├─ Start RTCP reading goroutine (CRITICAL!)
   └─ Broadcast to other clients

9. Other Clients: Receive Track
   └─ ontrack event → display remote video
```

## Critical Implementation Details

### 1. RTCP Packet Reading (Server-Side)
**WHY IT'S CRITICAL:**
- Pion WebRTC requires reading RTCP packets from RTPSender
- Not reading causes **memory leaks** and **poor connection quality**
- RTCP contains feedback for congestion control and quality

**Implementation:**
```go
senders := c.room.broadcastTrack(localTrack, c)

// Read RTCP packets from each sender
for _, sender := range senders {
    go func(s *webrtc.RTPSender) {
        rtcpBuf := make([]byte, 1500)
        for {
            if _, _, rtcpErr := s.Read(rtcpBuf); rtcpErr != nil {
                return
            }
            // Pion processes RTCP internally
        }
    }(sender)
}
```

### 2. Transceiver Directions
**Server (Pion):**
```go
pc.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio, 
    webrtc.RTPTransceiverInit{
        Direction: webrtc.RTPTransceiverDirectionRecvonly,
    })
```
- Server only receives media from clients

**Client (Browser):**
```typescript
// Use standard addTrack() - creates sendrecv automatically
pc.addTrack(track, stream);
```
- Client sends and receives media

### 3. Signaling State Management
**Server:**
```go
c.signalingMu.Lock()
defer c.signalingMu.Unlock()

if c.pc.SignalingState() != webrtc.SignalingStateStable {
    return // Skip renegotiation if not stable
}
```

**Client:**
```typescript
pc.onnegotiationneeded = async () => {
    // In SFU architecture, server drives negotiation
    // This event is informational only
};
```

### 4. ICE Candidate Handling
```typescript
const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

// Queue candidates if remote description not set
if (pc.remoteDescription) {
    await pc.addIceCandidate(candidate);
} else {
    pendingCandidatesRef.current.push(candidate);
}

// After setRemoteDescription, add queued candidates
for (const candidate of pendingCandidatesRef.current) {
    await pc.addIceCandidate(candidate);
}
```

### 5. Track Management
**Adding Tracks (Client):**
```typescript
// Standard WebRTC API
const sender = pc.addTrack(track, stream);
```

**Broadcasting Tracks (Server):**
```go
// Return senders for RTCP reading
func (r *Room) broadcastTrack(track *webrtc.TrackLocalStaticRTP, sender *Client) []*webrtc.RTPSender {
    var senders []*webrtc.RTPSender
    for client := range r.clients {
        if client == sender {
            continue
        }
        rtpSender, err := client.pc.AddTrack(track)
        if err != nil {
            continue
        }
        senders = append(senders, rtpSender)
        client.renegotiate()
    }
    return senders
}
```

## WebSocket Message Types

### Client → Server
- `offer`: SDP offer (not used in current flow)
- `answer`: SDP answer in response to server offer
- `candidate`: ICE candidate

### Server → Client
- `offer`: Initial SDP offer
- `answer`: SDP answer (not used in current flow)
- `candidate`: ICE candidate
- `client-left`: Notification when participant leaves

## Connection States

### ICE Connection States
- `new` → `checking` → `connected` → `completed`
- `failed`: Connection couldn't be established
- `disconnected`: Connection lost
- `closed`: Connection terminated

### Signaling States
- `stable`: No offer/answer in progress
- `have-local-offer`: Created offer, waiting for answer
- `have-remote-offer`: Received offer, need to create answer

## Two-Step Permission Flow

### Step 1: Request Media Access
```typescript
const stream = await mediaDevices.startMedia();
if (!stream || stream.getTracks().length === 0) {
    throw new Error('Failed to get media stream');
}
setMediaReady(true);
```

### Step 2: Join Room
```typescript
// Create peer connection
const pc = webrtc.createPeerConnection(...);

// Add tracks BEFORE connecting WebSocket
for (const track of stream.getTracks()) {
    await webrtc.addTrack(track, stream);
}

// Then connect WebSocket
await websocket.connect(wsUrl, handleMessage);
```

## Cross-Platform Optimizations

### Desktop Constraints
```typescript
{
    video: { width: 1280, height: 720, frameRate: 30 },
    audio: { 
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
        channelCount: 2
    }
}
```

### Mobile Constraints
```typescript
{
    video: { 
        width: 640, 
        height: 480, 
        frameRate: 24,
        facingMode: 'user'  // Front camera
    },
    audio: { 
        echoCancellation: true,
        noiseSuppression: true
    }
}
```

### Safari/iOS Constraints
```typescript
{
    video: true,  // Simplified
    audio: {
        echoCancellation: true,
        noiseSuppression: true
        // No sampleRate or channelCount for Safari
    }
}
```

## Error Handling

### Common Errors
1. **NotAllowedError**: User denied permissions
2. **NotFoundError**: No camera/microphone found
3. **AbortError**: Device in use by another app
4. **OverconstrainedError**: Requested constraints not supported

### Platform-Specific Help
```typescript
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const isSafari = navigator.userAgent.includes('Safari') && 
                 !navigator.userAgent.includes('Chrome');

if (isMac) {
    errorMessage += 'Check System Settings > Privacy & Security';
    if (isSafari) {
        errorMessage += ' Also check Safari address bar camera icon';
    }
}
```

## Performance Optimizations

### 1. Immediate Audio Playback
```typescript
// Don't wait for metadata
videoElement.srcObject = stream;
stream.getAudioTracks()[0].enabled = true;
await videoElement.play();

// Then set audio output asynchronously
setTimeout(() => {
    if ('setSinkId' in videoElement) {
        videoElement.setSinkId(deviceId);
    }
}, 0);
```

### 2. Hardware Acceleration
```tsx
<video
    style={{ WebkitTransform: 'translateZ(0)' }}
    disablePictureInPicture
/>
```

### 3. Message Buffering
```go
const maxMessageSize = 65536 // 64KB for large SDP
```

## Testing Checklist

### Browser Compatibility
- ✓ Chrome 90+ (Windows/Mac/Linux)
- ✓ Firefox 88+ (Windows/Mac/Linux)
- ✓ Safari 14+ (Mac)
- ✓ Edge 90+ (Windows)
- ✓ iOS Safari 14+
- ✓ Android Chrome 90+

### Network Scenarios
- ✓ Same network (LAN)
- ✓ Different networks (WAN)
- ✓ Behind NAT (STUN required)
- ✗ Symmetric NAT (would need TURN)
- ✓ Mobile networks (4G/5G)

### Quality Scenarios
- ✓ 1-2 participants: High quality
- ✓ 3-5 participants: Medium quality
- ⚠ 6+ participants: Consider TURN/load balancing

## Known Limitations

1. **No TURN Server**: Won't work behind symmetric NAT
2. **No Simulcast**: No adaptive quality per client
3. **No Recording**: Server doesn't record sessions
4. **No E2E Encryption**: Media visible to server
5. **Single Server**: No horizontal scaling

## Deployment Checklist

- ✓ HTTPS/WSS required (except localhost)
- ✓ CORS properly configured
- ✓ Firewall allows UDP (STUN/TURN)
- ✓ PM2 for process management
- ✓ Error logging and monitoring
- ⚠ Consider TURN server for production
- ⚠ Consider load balancing for scale

## References

### Official Documentation
- [MDN WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Pion WebRTC v3](https://github.com/pion/webrtc)
- [Next.js 15 Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)

### Best Practices
- [WebRTC for the Curious](https://webrtcforthecurious.com/)
- [Pion Examples](https://github.com/pion/webrtc/tree/master/examples)
- [W3C WebRTC Spec](https://www.w3.org/TR/webrtc/)

---

**Last Updated**: 2025-10-20  
**Architecture**: SFU (Selective Forwarding Unit)  
**Status**: ✅ Production Ready with RTCP handling
