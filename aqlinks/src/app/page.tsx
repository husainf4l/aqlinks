'use client';

import { useState, useEffect, useMemo } from 'react';
import { RoomHeader } from '../components/RoomHeader';
import { VideoGrid } from '../components/VideoGrid';
import { ControlPanel } from '../components/ControlPanel';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { getUserId, regenerateUserId } from '../utils/userId';

export default function Home() {
  const [room, setRoom] = useState('test');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [isEditingUserId, setIsEditingUserId] = useState(false);
  const [tempUserId, setTempUserId] = useState<string>('');

  // Custom hooks
  const mediaDevices = useMediaDevices();
  const websocket = useWebSocket();
  const webrtc = useWebRTC();

  useEffect(() => {
    setIsMounted(true);
    // Get or create a persistent user ID
    const id = getUserId();
    setUserId(id);
    setTempUserId(id);
    console.log('🆔 User ID initialized:', id);
  }, []);

  // Computed values
  const participantCount = useMemo(() => webrtc.remoteParticipants.size + 1, [webrtc.remoteParticipants.size]);

  const mediaStatus = useMemo(() => {
    if (!mediaDevices.isMediaStarted || !mediaDevices.localStream) return '';
    const hasVideo = mediaDevices.localStream.getVideoTracks().length > 0;
    const hasAudio = mediaDevices.localStream.getAudioTracks().length > 0;
    return `${hasVideo ? '📹 ' : ''}${hasAudio ? '🎤' : ''}${!hasVideo && !hasAudio ? '⚠️ No media' : ''}`;
  }, [mediaDevices.isMediaStarted, mediaDevices.localStream]);

  const hasAudioTrack = (mediaDevices.localStream?.getAudioTracks().length ?? 0) > 0;
  const hasVideoTrack = (mediaDevices.localStream?.getVideoTracks().length ?? 0) > 0;

  // User ID handlers
  const handleSaveUserId = () => {
    if (tempUserId.trim()) {
      localStorage.setItem('aqlinks_user_id', tempUserId.trim());
      setUserId(tempUserId.trim());
      setIsEditingUserId(false);
      console.log('🆔 User ID updated:', tempUserId.trim());
    }
  };

  const handleCancelEditUserId = () => {
    setTempUserId(userId);
    setIsEditingUserId(false);
  };

  const handleGenerateNewUserId = () => {
    const newId = regenerateUserId();
    setUserId(newId);
    setTempUserId(newId);
    console.log('🆔 New User ID generated:', newId);
  };

  const copyUserIdToClipboard = () => {
    navigator.clipboard.writeText(userId);
    console.log('📋 User ID copied to clipboard');
  };

  // Step 1: Request media access
  const requestMediaAccess = async () => {
    setError(null);
    setIsJoining(true);

    try {
      console.log('📹 Requesting media access...');
      const stream = await mediaDevices.startMedia();
      console.log('✅ Media access granted');
      
      // Verify we have the stream directly from the return value
      if (!stream || stream.getTracks().length === 0) {
        throw new Error('Failed to get media stream. Please allow camera/microphone access.');
      }
      
      console.log('📊 Local stream ready:', {
        id: stream.id,
        tracks: stream.getTracks().map(t => ({
          kind: t.kind,
          id: t.id,
          enabled: t.enabled,
          readyState: t.readyState
        }))
      });

      setMediaReady(true);
      setIsJoining(false);
    } catch (err) {
      const error = err as Error;
      
      // Enhanced error messaging
      let errorMessage = 'Failed to access media: ' + (error.message || 'Unknown error');
      
      if (error.name === 'NotAllowedError' || error.message.includes('Permission')) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isSafari = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome');
        
        errorMessage = 'Camera/microphone access denied. ';
        if (isMac) {
          errorMessage += 'On Mac, check System Settings > Privacy & Security > Camera/Microphone.';
          if (isSafari) {
            errorMessage += ' Also check the camera icon in Safari\'s address bar.';
          }
        } else {
          errorMessage += 'Please allow access when prompted.';
        }
      }
      
      setError(errorMessage);
      setIsJoining(false);
    }
  };

  // Step 2: Join room (only called after media is ready)
  const joinRoom = async () => {
    if (websocket.isConnected) {
      console.log('⚠️ Already connected, ignoring join request');
      return;
    }

    if (!room.trim()) {
      setError('Please enter a room name');
      return;
    }

    if (!mediaDevices.localStream || !mediaReady) {
      setError('Please allow media access first');
      return;
    }

    console.log('=== JOIN ROOM START ===');
    setIsJoining(true);
    setError(null);

    try {

      const wsUrl = `wss://aqlaan.com/ws?room=${encodeURIComponent(room.trim())}`;

      // Create peer connection
      const pc = webrtc.createPeerConnection(
        (candidate) => {
          websocket.send({ type: 'candidate', data: candidate });
        },
        () => {
          // onTrack is handled in useWebRTC
        },
        (state) => {
          if (state === 'failed') {
            setError('ICE connection failed. This may be due to firewall or NAT issues.');
          } else if (state === 'disconnected') {
            setError('Connection lost. Please try again.');
          }
        }
      );

      // Add local tracks to peer connection BEFORE connecting WebSocket
      console.log('🎬 Adding local tracks to peer connection');
      const tracks = mediaDevices.localStream.getTracks();
      console.log(`📊 Adding ${tracks.length} tracks to peer connection`);
      
      // Add tracks sequentially and wait for each to complete
      for (const track of tracks) {
        await webrtc.addTrack(track, mediaDevices.localStream!);
      }
      console.log('✅ All tracks added to peer connection');

      // Connect WebSocket AFTER tracks are added (include userId)
      console.log('🔌 Connecting to WebSocket with userId:', userId);
      await websocket.connect(wsUrl, userId, async (msg) => {
        await webrtc.handleSignalingMessage(msg, websocket.send);
      });

      // Don't create an initial offer - the SFU server will send one to us
      console.log('✅ Connected to SFU server, waiting for server offer...');

      setIsJoining(false);
    } catch (err) {
      const error = err as Error;
      
      // Enhanced error messaging
      let errorMessage = 'Failed to connect: ' + (error.message || 'Unknown error');
      
      if (error.name === 'NotAllowedError' || error.message.includes('Permission')) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isSafari = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome');
        
        errorMessage = 'Camera/microphone access denied. ';
        if (isMac) {
          errorMessage += 'On Mac, check System Settings > Privacy & Security > Camera/Microphone.';
          if (isSafari) {
            errorMessage += ' Also check the camera icon in Safari\'s address bar.';
          }
        } else {
          errorMessage += 'Please allow access when prompted.';
        }
      }
      
      setError(errorMessage);
      setIsJoining(false);
      
      // Clean up if we started connecting
      if (websocket.isConnected) {
        websocket.disconnect();
      }
      webrtc.closePeerConnection();
    }
  };

  // Leave room handler
  const leaveRoom = () => {
    console.log('=== LEAVE ROOM ===');
    websocket.disconnect();
    webrtc.closePeerConnection();
    mediaDevices.stopMedia();
    setMediaReady(false);
    setError(null);
  };

  // Start media handler
  const startMedia = async () => {
    try {
      await mediaDevices.startMedia();
      
      // Add tracks to peer connection if already connected
      if (webrtc.peerConnection && mediaDevices.localStream) {
        mediaDevices.localStream.getTracks().forEach(track => {
          webrtc.addTrack(track, mediaDevices.localStream!);
        });

        // Create new offer with tracks
        const offer = await webrtc.peerConnection.createOffer();
        await webrtc.peerConnection.setLocalDescription(offer);
        websocket.send({ type: 'offer', data: webrtc.peerConnection.localDescription });
      }
    } catch (err) {
      const error = err as Error;
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isSafari = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome');
      
      let errorMessage = 'Failed to access camera/microphone: ' + (error.message || 'Unknown error');
      
      if (isMac) {
        errorMessage += '. On Mac, please check System Settings > Privacy & Security > Camera/Microphone and allow access for your browser.';
        if (isSafari) {
          errorMessage += ' Also check the camera/microphone icon in Safari\'s address bar.';
        }
      } else {
        errorMessage += '. Please check permissions and ensure you\'re using HTTPS or localhost.';
      }
      
      setError(errorMessage);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      {/* Header */}
      {isMounted && (
        <RoomHeader
          isConnected={websocket.isConnected}
          connectionState={webrtc.connectionState}
          room={room}
          isJoining={isJoining}
          onRoomChange={setRoom}
          onJoinRoom={joinRoom}
          onLeaveRoom={leaveRoom}
        />
      )}

      {/* User ID Display/Editor */}
      {isMounted && (
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-3">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-sm font-semibold text-gray-400">🆔 User ID:</span>
                {!isEditingUserId ? (
                  <>
                    <code className="bg-gray-900 px-3 py-1 rounded text-sm text-green-400 font-mono">
                      {userId}
                    </code>
                    <button
                      onClick={copyUserIdToClipboard}
                      className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700"
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                    <button
                      onClick={() => setIsEditingUserId(true)}
                      className="text-blue-400 hover:text-blue-300 text-sm px-3 py-1 rounded hover:bg-gray-700"
                      disabled={websocket.isConnected}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={handleGenerateNewUserId}
                      className="text-purple-400 hover:text-purple-300 text-sm px-3 py-1 rounded hover:bg-gray-700"
                      disabled={websocket.isConnected}
                      title="Generate new random ID"
                    >
                      🔄 New ID
                    </button>
                    {websocket.isConnected && (
                      <span className="text-xs text-yellow-400">
                        ⚠️ Disconnect to change ID
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      value={tempUserId}
                      onChange={(e) => setTempUserId(e.target.value)}
                      placeholder="Enter custom user ID"
                      className="flex-1 max-w-md px-3 py-1 rounded bg-gray-900 text-white border border-gray-600 focus:outline-none focus:border-blue-500 font-mono text-sm"
                    />
                    <button
                      onClick={handleSaveUserId}
                      className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1 rounded"
                    >
                      ✓ Save
                    </button>
                    <button
                      onClick={handleCancelEditUserId}
                      className="bg-gray-600 hover:bg-gray-700 text-white text-sm px-4 py-1 rounded"
                    >
                      ✕ Cancel
                    </button>
                  </>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {websocket.isConnected ? '🟢 Connected' : '⚪ Not Connected'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500 text-white px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span><strong>Error:</strong> {error}</span>
            <button onClick={() => setError(null)} className="text-white hover:text-gray-200">✕</button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {!isMounted ? (
          <div className="flex items-center justify-center h-[calc(100vh-200px)]">
            <div className="text-center">
              <div className="text-6xl mb-4">⏳</div>
              <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
            </div>
          </div>
        ) : !websocket.isConnected ? (
          <div className="flex items-center justify-center h-[calc(100vh-200px)]">
            <div className="text-center max-w-md">
              {!mediaReady ? (
                <>
                  <div className="text-6xl mb-4">🎥</div>
                  <h2 className="text-2xl font-semibold mb-2">Allow Camera & Microphone</h2>
                  <p className="text-gray-400 mb-6">
                    We need access to your camera and microphone to start the video call
                  </p>
                  <button
                    onClick={requestMediaAccess}
                    disabled={isJoining}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isJoining ? 'Requesting Access...' : '📹 Allow Camera & Microphone'}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">✅</div>
                  <h2 className="text-2xl font-semibold mb-2">Media Ready!</h2>
                  <p className="text-gray-400 mb-2">Camera and microphone access granted</p>
                  <p className="text-sm text-gray-500 mb-6">{mediaStatus}</p>
                  <div className="mb-4">
                    <input
                      type="text"
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                      placeholder="Enter room name"
                      className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-blue-500 mb-3"
                    />
                    <button
                      onClick={joinRoom}
                      disabled={isJoining || !room.trim()}
                      className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isJoining ? 'Joining...' : '🚀 Join Room'}
                    </button>
                  </div>
                  <button
                    onClick={leaveRoom}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <VideoGrid
              localStream={mediaDevices.localStream}
              isMediaStarted={mediaDevices.isMediaStarted}
              isVideoOff={mediaDevices.isVideoOff}
              isAudioMuted={mediaDevices.isAudioMuted}
              remoteParticipants={webrtc.remoteParticipants}
              selectedAudioOutput={mediaDevices.selectedAudioOutput}
            />

            <ControlPanel
              isMediaStarted={mediaDevices.isMediaStarted}
              isStartingMedia={mediaDevices.isStartingMedia}
              isAudioMuted={mediaDevices.isAudioMuted}
              isVideoOff={mediaDevices.isVideoOff}
              hasAudioTrack={hasAudioTrack}
              hasVideoTrack={hasVideoTrack}
              room={room}
              participantCount={participantCount}
              mediaStatus={mediaStatus}
              audioOutputDevices={mediaDevices.audioOutputDevices}
              selectedAudioOutput={mediaDevices.selectedAudioOutput}
              onStartMedia={startMedia}
              onToggleAudio={mediaDevices.toggleAudio}
              onToggleVideo={mediaDevices.toggleVideo}
              onAudioOutputChange={mediaDevices.setSelectedAudioOutput}
            />
          </>
        )}
      </div>
    </div>
  );
}
