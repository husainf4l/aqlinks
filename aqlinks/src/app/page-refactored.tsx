'use client';

import { useState, useEffect, useMemo } from 'react';
import { RoomHeader } from '../components/RoomHeader';
import { VideoGrid } from '../components/VideoGrid';
import { ControlPanel } from '../components/ControlPanel';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWebRTC } from '../hooks/useWebRTC';

export default function Home() {
  const [room, setRoom] = useState('test');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Custom hooks
  const mediaDevices = useMediaDevices();
  const websocket = useWebSocket();
  const webrtc = useWebRTC();

  useEffect(() => {
    setIsMounted(true);
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

  // Join room handler
  const joinRoom = async () => {
    if (websocket.isConnected) {
      console.log('⚠️ Already connected, ignoring join request');
      return;
    }

    if (!room.trim()) {
      setError('Please enter a room name');
      return;
    }

    console.log('=== JOIN ROOM START ===');
    setIsJoining(true);
    setError(null);

    try {
      const wsUrl = `wss://aqlaan.com/ws?room=${encodeURIComponent(room.trim())}`;

      // Create peer connection first
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

      // Connect WebSocket
      await websocket.connect(wsUrl, async (msg) => {
        await webrtc.handleSignalingMessage(msg, websocket.send);
      });

      // Create initial offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      websocket.send({ type: 'offer', data: pc.localDescription });

      setIsJoining(false);
    } catch (err) {
      const error = err as Error;
      setError('Failed to connect: ' + (error.message || 'Unknown error'));
      setIsJoining(false);
    }
  };

  // Leave room handler
  const leaveRoom = () => {
    console.log('=== LEAVE ROOM ===');
    websocket.disconnect();
    webrtc.closePeerConnection();
    mediaDevices.stopMedia();
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
            <div className="text-center">
              <div className="text-6xl mb-4">🎥</div>
              <h2 className="text-2xl font-semibold mb-2">Ready to join?</h2>
              <p className="text-gray-400">Enter a room name and click "Join Room" to start</p>
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
