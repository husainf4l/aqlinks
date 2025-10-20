# AqLinks WebRTC Testing Guide

## Quick Start Testing

### Test 1: Single Device - Two Tabs
**Purpose:** Test basic connection and video display

1. Open browser tab #1
2. Join room "test"
3. Allow camera/microphone
4. **Expected:** See your own video
5. Open browser tab #2 (same browser)
6. Join same room "test"
7. **Expected:** Both tabs show both videos immediately

**Success Criteria:**
- ✅ Both videos appear in < 2 seconds
- ✅ Audio works both ways
- ✅ Closing one tab removes video from other tab
- ✅ User ID shows in UI and is different per tab (unless hardcoded)

### Test 2: Two Devices - Same Network
**Purpose:** Test cross-device connectivity

**Device A (Computer):**
1. Go to https://aqlaan.com/
2. Join room "test"
3. Note your User ID

**Device B (Phone/Tablet):**
1. Go to https://aqlaan.com/
2. Join room "test"
3. Should see Device A's video

**Success Criteria:**
- ✅ Both devices see each other
- ✅ Audio works both ways
- ✅ No echo or feedback
- ✅ Video quality is acceptable
- ✅ Connection stable (no freezing)

### Test 3: Two Devices - Different Networks
**Purpose:** Test STUN/ICE functionality

1. Device A on WiFi, Device B on mobile data
2. Join same room
3. Check connection

**Success Criteria:**
- ✅ Connection establishes despite NAT
- ✅ Video/audio quality acceptable
- ✅ Latency < 500ms

## Detailed Browser Console Tests

### Test Connection Flow

Open browser console (F12) and check for these logs in order:

#### When Joining:
```javascript
🆔 User ID initialized: {uuid}
📹 Requesting media access...
✅ Media access granted
🔌 Creating new RTCPeerConnection
✅ PeerConnection created with optimized config
🔌 Connecting to WebSocket with userId: {uuid}
📥 Received offer from server
✅ Remote description (offer) set
📝 Created answer
✅ Local description (answer) set
📤 Sent answer to server
🧊 New ICE candidate: {candidate}
🧊 ICE Connection State: checking
🧊 ICE Connection State: connected
```

#### When Another User Joins:
```javascript
🎬 RECEIVED TRACK: video
📊 Track details: {kind, trackId, streamId}
👤 New participant joined: {streamId}
🎬 RECEIVED TRACK: audio
➕ Added audio track to existing participant {streamId}
```

#### When User Leaves:
```javascript
👋 Client left notification: {clientId}
📊 Current participants: [{clientId}]
🧹 Removing participant: {clientId}
⏹️ Stopped video track: {trackId}
⏹️ Stopped audio track: {trackId}
✅ Participant removed. Remaining: []
```

## Common Issues & Solutions

### Issue 1: "No video appears"
**Symptoms:** Can't see remote user's video

**Debug Steps:**
1. Check browser console for errors
2. Verify both users in same room name
3. Check server logs: `pm2 logs 18`
4. Look for: `🎬 OnTrack fired` messages
5. Check if ICE connected: `🧊 ICE Connection State: connected`

**Possible Causes:**
- Camera/mic permission denied
- Different room names
- Server not running
- Firewall blocking WebRTC

**Solutions:**
```bash
# Check server is running
pm2 status

# Restart server
pm2 restart 18

# Check server logs
pm2 logs 18 --lines 50

# Clear browser cache and reload
Ctrl+Shift+R (or Cmd+Shift+R on Mac)
```

### Issue 2: "Video appears but freezes"
**Symptoms:** Video shows but doesn't update

**Debug Steps:**
1. Open browser console
2. Look for track errors: `❌ Track read error`
3. Check network: DevTools > Network tab
4. Check CPU usage

**Solutions:**
- Reduce video quality in browser settings
- Close other tabs/applications
- Check internet speed
- Try different browser

### Issue 3: "Audio echo/feedback"
**Symptoms:** Hear yourself speaking with delay

**Cause:** Both devices too close with speakers on

**Solutions:**
- Use headphones on at least one device
- Mute microphone on one device
- Move devices apart

### Issue 4: "Connection takes long time"
**Symptoms:** > 5 seconds to connect

**Debug Steps:**
1. Check server logs for renegotiations
2. Should see only ONE offer/answer cycle
3. If multiple `🔄 Triggering renegotiation`, optimization failed

**Solutions:**
```bash
# Rebuild and restart server
cd /home/husain/Desktop/aqlinks/aqlinks/server
go build -o sfu-server main.go
pm2 restart 18
```

### Issue 5: "User stays after leaving"
**Symptoms:** Video remains after user closes tab

**Debug Steps:**
1. Check server logs: `👋 Client {id} left room test`
2. Check frontend console: `🧹 Removing participant`
3. If no removal log, stream ID mismatch

**Solutions:**
- Already fixed in latest version
- Stream ID = Client ID now
- Clear browser cache and test again

## Performance Testing

### Test Media Tracks
Open console and run:
```javascript
// Check local stream
const localVideo = document.querySelector('video');
const stream = localVideo.srcObject;
console.log('Local tracks:', stream.getTracks().map(t => ({
  kind: t.kind,
  enabled: t.enabled,
  readyState: t.readyState,
  label: t.label
})));

// Check remote participants (if using React DevTools)
// Look for remoteParticipants in component state
```

### Test ICE Candidates
```javascript
// In browser console, check ICE stats
const pc = window.peerConnection; // If exposed for debugging
if (pc) {
  pc.getStats().then(stats => {
    stats.forEach(report => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        console.log('Active ICE candidate pair:', report);
      }
    });
  });
}
```

### Test Connection Quality
Open browser console and monitor:
```javascript
// Check video element stats
const video = document.querySelector('video[data-remote]');
if (video) {
  console.log('Video stats:', {
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    readyState: video.readyState,
    paused: video.paused,
    muted: video.muted
  });
}
```

## Server-Side Testing

### Check Server Health
```bash
# View server status
pm2 status

# View live logs
pm2 logs 18

# View last 100 lines
pm2 logs 18 --lines 100

# Flush old logs
pm2 flush 18

# Restart server
pm2 restart 18
```

### Monitor Server Metrics
```bash
# CPU and Memory usage
pm2 monit

# Detailed process info
pm2 show 18
```

### Test Server Endpoints
```bash
# Check if server is responding
curl https://aqlaan.com/

# Test WebSocket endpoint (should upgrade connection)
# Note: Regular curl won't work for WebSocket, but no error means server is running
```

## Network Testing

### Test Firewall/NAT
```javascript
// In browser console, check ICE candidates
// Look for 'srflx' (STUN) and 'relay' (TURN) candidates
// If only 'host' candidates, STUN server may be blocked

// Example good output:
// 🧊 New ICE candidate: candidate:... typ srflx ...
// 🧊 New ICE candidate: candidate:... typ host ...
```

### Test STUN Servers
The app uses:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

If connection fails, these might be blocked by firewall.

## Mobile Device Testing

### iOS (iPhone/iPad)
1. **Safari Only:** Chrome/Firefox don't support WebRTC getUserMedia on iOS
2. Go to Settings > Safari > Camera/Microphone > Allow
3. Use HTTPS (required for media access)
4. Test in landscape and portrait modes

**Known Issues:**
- iOS Safari sometimes needs page refresh after allowing permissions
- Background tabs may pause video
- System calls interrupt WebRTC

### Android
1. Works in Chrome, Firefox, Edge
2. Allow camera/microphone when prompted
3. Test with screen on and off
4. Test during phone calls (should disconnect)

**Known Issues:**
- Some Android devices have hardware acceleration issues
- Battery saver mode may affect performance

## Cross-Browser Testing

### Chrome/Edge (Recommended)
- ✅ Full WebRTC support
- ✅ Best performance
- ✅ DevTools for debugging

### Firefox
- ✅ Full WebRTC support
- ⚠️ Slightly different behavior
- ✅ Good privacy controls

### Safari
- ✅ WebRTC support (iOS 11+)
- ⚠️ Quirky permissions
- ⚠️ May need page refresh

### Opera
- ✅ Based on Chromium
- ✅ Should work like Chrome

## Automated Test Checklist

- [ ] User can join room
- [ ] Camera/microphone permissions requested
- [ ] Local video appears
- [ ] User ID displays correctly
- [ ] Second user can join
- [ ] Both users see each other
- [ ] Audio works both directions
- [ ] Video quality acceptable
- [ ] User leaves, video removed from other user
- [ ] Refresh page, same user ID reused
- [ ] Multiple users (3+) all see each other
- [ ] Mobile device can connect
- [ ] Different networks can connect
- [ ] User ID can be edited
- [ ] User ID can be regenerated

## Load Testing

### Test with Multiple Users
```bash
# This requires multiple devices or VMs
# Goal: Test with 5-10 simultaneous users

# Monitor server during load test:
pm2 monit

# Expected:
# - Memory usage: ~10-20MB per client
# - CPU usage: < 50% with 10 users
# - No crashes or errors
```

## Debugging Tools

### Browser DevTools
1. **Console:** View logs and errors
2. **Network:** Check WebSocket connection
3. **Application > Storage > Local Storage:** View user ID
4. **More Tools > WebRTC Internals:** Chrome's WebRTC stats

### Chrome WebRTC Internals
1. Open `chrome://webrtc-internals/`
2. Shows all active peer connections
3. View ICE candidates, stats, graphs
4. Check audio/video codec info

### Server Logs
```bash
# Live tail
pm2 logs 18 --lines 0

# Look for these patterns:
# Good: ✅ ⚡ 🎬 📡 🧊
# Bad: ❌ ⚠️ 🛑
# Info: 📊 📝 🔗 👤
```

## Success Metrics

### Excellent Performance
- Connection time: < 1 second
- Video appears: < 2 seconds
- Latency: < 100ms
- Zero dropped frames
- Clear audio, no echo

### Acceptable Performance
- Connection time: < 3 seconds
- Video appears: < 5 seconds
- Latency: < 300ms
- Occasional frame drops
- Minor audio artifacts

### Poor Performance (Needs Investigation)
- Connection time: > 5 seconds
- Video delayed or frozen
- Latency: > 500ms
- Frequent disconnections
- Choppy audio or echo

## Next Steps After Testing

If all tests pass:
- ✅ System is production-ready
- ✅ Can deploy to more users
- ✅ Consider adding features

If tests fail:
1. Document the failure scenario
2. Check server logs for errors
3. Check browser console for errors
4. Review network conditions
5. Test on different devices/networks
6. Report specific error messages

---

**Last Updated:** October 20, 2025  
**Version:** 1.0.0  
**Status:** Ready for Testing
