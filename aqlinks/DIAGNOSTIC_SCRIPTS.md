# Quick Diagnostic Script

Run this in the browser console on BOTH devices to check the current state:

## Check Local Media

```javascript
// Check local video element
const localVideo = document.querySelector('video[muted]');
if (localVideo && localVideo.srcObject) {
  const stream = localVideo.srcObject;
  console.log('=== LOCAL MEDIA ===');
  console.log('Stream ID:', stream.id);
  console.log('Total tracks:', stream.getTracks().length);
  stream.getTracks().forEach(track => {
    console.log(`  ${track.kind}:`, {
      id: track.id.substring(0, 8),
      label: track.label,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      settings: track.getSettings()
    });
  });
} else {
  console.log('❌ NO LOCAL STREAM');
}
```

## Check Remote Media

```javascript
// Check all remote video elements
const remoteVideos = Array.from(document.querySelectorAll('video:not([muted])'));
console.log('=== REMOTE MEDIA ===');
console.log('Remote video elements:', remoteVideos.length);

remoteVideos.forEach((video, index) => {
  const stream = video.srcObject;
  if (stream) {
    console.log(`\nRemote ${index + 1}:`);
    console.log('  Stream ID:', stream.id);
    console.log('  Total tracks:', stream.getTracks().length);
    stream.getTracks().forEach(track => {
      console.log(`    ${track.kind}:`, {
        id: track.id.substring(0, 8),
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });
    });
    console.log('  Video element:', {
      paused: video.paused,
      currentTime: video.currentTime,
      readyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight
    });
  } else {
    console.log(`\nRemote ${index + 1}: ❌ NO STREAM`);
  }
});
```

## Check PeerConnection

```javascript
// Find PeerConnection (you might need to expose it globally for this to work)
console.log('=== PEER CONNECTION ===');
console.log('Note: PeerConnection might not be exposed globally');
console.log('Check useWebRTC hook in React DevTools instead');
```

## Force Enable All Tracks

If you see tracks but video isn't showing, try force-enabling:

```javascript
// Enable all remote video tracks
document.querySelectorAll('video:not([muted])').forEach(video => {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => {
      console.log(`${track.kind} track ${track.id}:`, track.enabled ? '✅ enabled' : '❌ disabled');
      if (!track.enabled) {
        track.enabled = true;
        console.log('  → ✅ Enabled!');
      }
    });
  }
});
```

## Check if Video is Actually Playing

```javascript
document.querySelectorAll('video').forEach((video, i) => {
  console.log(`Video ${i}:`, {
    muted: video.muted,
    paused: video.paused,
    currentTime: video.currentTime,
    duration: video.duration || 'N/A',
    readyState: video.readyState,
    networkState: video.networkState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    hasStream: !!video.srcObject,
    trackCount: video.srcObject ? video.srcObject.getTracks().length : 0
  });
});
```

## Manual Play Trigger

If autoplay is blocked:

```javascript
document.querySelectorAll('video:not([muted])').forEach(async (video, i) => {
  try {
    await video.play();
    console.log(`✅ Video ${i} playing`);
  } catch (err) {
    console.error(`❌ Video ${i} play failed:`, err.message);
  }
});
```

## Check Transceiver Directions

This requires accessing the PeerConnection object. You may need to temporarily expose it:

```javascript
// In useWebRTC.ts, temporarily add:
// (window as any).pc = peerConnectionRef.current;

// Then in console:
if (window.pc) {
  console.log('=== TRANSCEIVERS ===');
  window.pc.getTransceivers().forEach((t, i) => {
    console.log(`[${i}] ${t.receiver.track?.kind}:`, {
      direction: t.direction,
      currentDirection: t.currentDirection,
      mid: t.mid,
      stopped: t.stopped,
      sender: {
        track: t.sender.track?.id,
      },
      receiver: {
        track: t.receiver.track?.id,
      }
    });
  });
}
```

## Expected Output (Working State)

### Device A (after Device B joins)
```
=== LOCAL MEDIA ===
Stream ID: abc-123-local
Total tracks: 2
  audio: { enabled: true, muted: false, readyState: "live" }
  video: { enabled: true, muted: false, readyState: "live" }

=== REMOTE MEDIA ===
Remote video elements: 1

Remote 1:
  Stream ID: device-b-client-id
  Total tracks: 2
    audio: { enabled: true, muted: false, readyState: "live" }
    video: { enabled: true, muted: false, readyState: "live" }
  Video element: { paused: false, videoWidth: 1280, videoHeight: 720 }
```

### Device B (after joining)
```
=== LOCAL MEDIA ===
Stream ID: xyz-456-local
Total tracks: 2
  audio: { enabled: true, muted: false, readyState: "live" }
  video: { enabled: true, muted: false, readyState: "live" }

=== REMOTE MEDIA ===
Remote video elements: 1

Remote 1:
  Stream ID: device-a-client-id
  Total tracks: 2
    audio: { enabled: true, muted: false, readyState: "live" }
    video: { enabled: true, muted: false, readyState: "live" }
  Video element: { paused: false, videoWidth: 1280, videoHeight: 720 }
```

## Troubleshooting Based on Output

### If you see `Total tracks: 1` (only audio)
**Problem:** Video track not being captured
**Fix:** Check camera permissions and getUserMedia constraints

### If you see `enabled: false` on video track
**Problem:** Track disabled
**Fix:** Run the "Force Enable All Tracks" script above

### If you see `readyState: "ended"`
**Problem:** Track ended unexpectedly
**Fix:** Check if camera is being used by another app, or re-request media

### If you see `videoWidth: 0, videoHeight: 0`
**Problem:** No video data being received
**Fix:** Check network, firewall, or STUN/TURN configuration

### If you see `paused: true`
**Problem:** Video element not playing
**Fix:** Run the "Manual Play Trigger" script above

### If you see `NO STREAM` on remote
**Problem:** Remote stream not set or participant not added
**Fix:** Check React state, remoteParticipants Map

---

**Usage:**
1. Copy the relevant script
2. Paste in browser console (F12)
3. Press Enter
4. Compare output with "Expected Output"
5. Follow troubleshooting based on what you see
