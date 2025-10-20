# WebRTC Connection Test Guide

## Issue Description
- Audio works fine ✅
- Video sometimes doesn't show up ❌
- One user sends, another receives inconsistently
- Bidirectional communication not always working

## Quick Diagnostic Steps

### Test 1: Check if Both Devices Are Sending Media

**Device 1:**
1. Open browser console (F12)
2. Join room "test"
3. Look for these logs:
   ```
   🎬 Adding audio track
   🎬 Adding video track
   ```
4. Check: Do you see BOTH tracks being added?

**Device 2:**
1. Open browser console (F12)
2. Join same room "test"
3. Look for the same logs

**Expected:** Both devices should show 2 tracks being added (1 audio + 1 video)

### Test 2: Check Server Logs

Run this command:
```bash
pm2 logs 18 --lines 100 --nostream | grep "OnTrack"
```

**Expected Output:**
```
🎬 OnTrack fired for client ABC: audio
🎬 OnTrack fired for client ABC: video
🎬 OnTrack fired for client XYZ: audio
🎬 OnTrack fired for client XYZ: video
```

If you see BOTH audio and video for BOTH clients → Server is working correctly ✅

### Test 3: Check Frontend Track Reception

**In Browser Console (on EACH device):**

Type this:
```javascript
// Check remote participants
console.log('Remote participants:', window.remoteParticipants);
```

Then check each participant:
```javascript
// Get all remote participants
const participants = document.querySelectorAll('video:not([muted])');
participants.forEach((video, index) => {
  const stream = video.srcObject;
  console.log(`Participant ${index}:`, {
    stream: stream,
    tracks: stream ? stream.getTracks().map(t => ({
      kind: t.kind,
      id: t.id,
      enabled: t.enabled,
      muted: t.muted,
      readyState: t.readyState
    })) : 'NO STREAM'
  });
});
```

**Expected:** Each participant should have 2 tracks (1 audio + 1 video)

## Common Issues & Fixes

### Issue 1: Video Track Not Enabled

**Symptom:** Server receives track but video doesn't show

**Fix:** Check if video track is enabled
```javascript
// In browser console
const participants = Array.from(document.querySelectorAll('video:not([muted])'));
participants.forEach(video => {
  const stream = video.srcObject;
  if (stream) {
    stream.getVideoTracks().forEach(track => {
      console.log('Video track:', track.id, 'enabled:', track.enabled, 'muted:', track.muted);
      if (!track.enabled) {
        track.enabled = true;
        console.log('✅ Enabled video track');
      }
    });
  }
});
```

### Issue 2: Media Constraints Wrong

**Symptom:** getUserMedia succeeds but no video

**Check:**
```javascript
// Check your local stream
const localVideo = document.querySelector('video[muted]');
if (localVideo && localVideo.srcObject) {
  const stream = localVideo.srcObject;
  console.log('Local tracks:', stream.getTracks().map(t => ({
    kind: t.kind,
    enabled: t.enabled,
    readyState: t.readyState,
    settings: t.getSettings()
  })));
}
```

### Issue 3: Transceiver Direction Wrong

**Symptom:** Tracks sent but not received

**Server logs show:**
```
Transceiver 0: kind=audio, direction=recvonly  ← WRONG (should be sendrecv)
Transceiver 1: kind=video, direction=recvonly  ← WRONG (should be sendrecv)
```

This is actually correct for SFU! The server uses `recvonly` to receive from client.

### Issue 4: Browser Permissions

**Mobile Devices (especially iOS):**
1. Settings → Safari → Camera
2. Settings → Safari → Microphone
3. Allow for https://aqlaan.com

**Android:**
1. Settings → Apps → Chrome → Permissions
2. Enable Camera and Microphone

### Issue 5: Network/Firewall

**Test with TURN server:**

Try connecting from different networks (WiFi vs mobile data) to see if firewall is blocking.

## Step-by-Step Testing Procedure

### Setup
1. Open two browser windows (or two devices)
2. Device A: `https://aqlaan.com`
3. Device B: `https://aqlaan.com` (different browser/device)

### Test Sequence

#### Part 1: Media Access
**Device A:**
1. Click "Allow Camera & Microphone"
2. Grant permissions
3. ✅ Should see your own video
4. Console: Should show "Media granted: 2 tracks"

**Device B:**
1. Same steps as Device A

**Check:** Both devices show their own video locally? → YES ✅

#### Part 2: Room Join (Device A First)
**Device A:**
1. Room: "test"
2. Click "Join Room"
3. Console logs to check:
   ```
   ✅ WebSocket connected
   ✅ PeerConnection created
   🎬 Adding audio track
   🎬 Adding video track
   📡 Connection State: connected
   ```

**Check:** No errors in console? → YES ✅

#### Part 3: Room Join (Device B Second)
**Device B:**
1. Room: "test" (same as Device A)
2. Click "Join Room"
3. Wait 2-3 seconds

**Expected Results:**
- Device A: Should see Device B's video appear
- Device B: Should see Device A's video appear
- Both devices: Console shows "🎬 RECEIVED TRACK" messages

**Console Check (Device A):**
```
🎬 RECEIVED TRACK: audio (id: xxx)
   Stream ID: <Device-B-Client-ID>
🎬 RECEIVED TRACK: video (id: xxx)
   Stream ID: <Device-B-Client-ID>
```

**Console Check (Device B):**
```
🎬 RECEIVED TRACK: audio (id: xxx)
   Stream ID: <Device-A-Client-ID>
🎬 RECEIVED TRACK: video (id: xxx)
   Stream ID: <Device-A-Client-ID>
```

#### Part 4: Verify Video Display

**On EACH Device:**
1. Check UI: How many video boxes do you see?
   - Expected: 2 (your local + 1 remote)
2. Is the remote video showing actual video or just "Camera off" placeholder?
3. Console check:
   ```javascript
   document.querySelectorAll('video').forEach((v, i) => {
     console.log(`Video ${i}:`, {
       muted: v.muted,
       src: v.srcObject ? 'HAS STREAM' : 'NO STREAM',
       tracks: v.srcObject ? v.srcObject.getTracks().length : 0,
       playing: !v.paused
     });
   });
   ```

## Debug Page Testing

Use the dedicated debug page:

1. Open `https://aqlaan.com/debug` on Device A
2. Open `https://aqlaan.com/debug` on Device B
3. Follow the buttons in order:
   - "📹 Start Media" → Check local video appears
   - "🔌 Connect" → Check WebSocket and PeerConnection status
4. Watch the logs panel - every action is logged
5. Check "Statistics" section for actual data being sent/received

## Server-Side Checks

### Check Active Connections
```bash
pm2 logs 18 --lines 50 --nostream | grep "total clients"
```

Should show: `Room test now has 2 clients`

### Check Tracks Broadcasting
```bash
pm2 logs 18 --lines 100 --nostream | grep "broadcasted to"
```

Should show:
```
✅ Track from CLIENT_A broadcasted to 1 clients
✅ Track from CLIENT_B broadcasted to 1 clients
```

### Check for Errors
```bash
pm2 logs 18 --lines 100 --nostream | grep "❌"
```

Should be minimal (only normal disconnections, not track errors)

## Expected Full Working Flow

### Server Logs
```
🔗 New connection: Client AAA (user: User1) joining room: test
✅ PeerConnection created for client AAA
👤 Client AAA added to room test (total clients: 1)
🧊 Client AAA - ICE Connection State: connected
🎬 OnTrack fired for client AAA: audio
🎬 OnTrack fired for client AAA: video
✅ Track from AAA broadcasted to 0 clients (nobody else yet)

🔗 New connection: Client BBB (user: User2) joining room: test
✅ PeerConnection created for client BBB
➕ Adding 2 existing tracks to new client BBB BEFORE initial offer
👤 Client BBB added to room test (total clients: 2)
🧊 Client BBB - ICE Connection State: connected
🎬 OnTrack fired for client BBB: audio
🎬 OnTrack fired for client BBB: video
✅ Track from BBB broadcasted to 1 clients (sent to AAA)
🔄 Triggering renegotiation for client AAA (to receive BBB's tracks)
```

### Browser Console (Device A)
```
🆔 User ID initialized: User1
📹 Requesting media access...
✅ Media access granted
🎬 Adding audio track
🎬 Adding video track
🔌 Connecting to WebSocket
✅ WebSocket connected
✅ PeerConnection created
📤 Sent answer to server
🧊 ICE Connection State: connected

[Device B joins]

🎬 RECEIVED TRACK: audio
   Stream ID: BBB
   ➕ Added audio to existing stream BBB
🎬 RECEIVED TRACK: video
   Stream ID: BBB
   🆕 New remote stream: BBB
```

### Browser Console (Device B)
```
🆔 User ID initialized: User2
📹 Requesting media access...
✅ Media access granted
🎬 Adding audio track
🎬 Adding video track
🔌 Connecting to WebSocket
✅ WebSocket connected
✅ PeerConnection created
📥 Processing offer (includes 2 existing tracks from AAA)
📤 Sent answer to server
🧊 ICE Connection State: connected

🎬 RECEIVED TRACK: audio
   Stream ID: AAA
🎬 RECEIVED TRACK: video
   Stream ID: AAA
   🆕 New remote stream: AAA
```

## What to Report

If it's still not working, provide:

1. **Device Info:**
   - Device A: Browser, OS, network (WiFi/mobile)
   - Device B: Browser, OS, network (WiFi/mobile)

2. **Console Logs:**
   - All console output from BOTH devices
   - Copy from first connection to when issue occurs

3. **Server Logs:**
   ```bash
   pm2 logs 18 --lines 200 --nostream
   ```

4. **Specific Behavior:**
   - Does Device A see Device B's video? YES/NO
   - Does Device B see Device A's video? YES/NO
   - Is audio working bidirectionally? YES/NO
   - Any error messages?

5. **Debug Page Results:**
   - Screenshots of the debug page on both devices
   - Especially the "Remote Videos" section and "Statistics"

## Quick Fixes to Try

### Fix 1: Hard Reload
Both devices: Ctrl+Shift+R (or Cmd+Shift+R on Mac)

### Fix 2: Clear Browser State
```javascript
// In console on BOTH devices
localStorage.clear();
sessionStorage.clear();
location.reload();
```

### Fix 3: Different Room Name
Try joining a different room to rule out room-specific issues

### Fix 4: Restart Server
```bash
pm2 restart 18
pm2 logs 18
```

### Fix 5: Check Camera/Mic Actually Working
Test with: `https://webcamtests.com`
If this doesn't show your camera/mic → permission issue

---

**Last Updated:** October 20, 2025  
**For Technical Support:** Check browser console and server logs first!
