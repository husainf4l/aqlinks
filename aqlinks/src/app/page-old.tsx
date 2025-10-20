'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  RemoteParticipant,
  ConnectionState,
  WebRTCError,
  WebRTCSignalingMessage
} from '../types';

export default function Home() {
  const [room, setRoom] = useState('test');
  const [isConnected, setIsConnected] = useState(false);
  const [isMediaStarted, setIsMediaStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isStartingMedia, setIsStartingMedia] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, RemoteParticipant>>(new Map());
  const [isMounted, setIsMounted] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>('');
  const maxReconnectAttempts = 3;
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const negotiationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Forward declarations for useCallback dependencies
  const joinRoomRef = useRef<(() => Promise<void>) | null>(null);
  const handleMessageRef = useRef<((event: MessageEvent) => Promise<void>) | null>(null);
  const attemptReconnectionRef = useRef<(() => void) | null>(null);
  const handleAnswerMessageRef = useRef<((msg: WebRTCSignalingMessage, currentState: RTCSignalingState) => Promise<void>) | null>(null);
  const handleOfferMessageRef = useRef<((msg: WebRTCSignalingMessage, currentState: RTCSignalingState) => Promise<void>) | null>(null);
  const handleCandidateMessageRef = useRef<((msg: WebRTCSignalingMessage) => Promise<void>) | null>(null);
  const handleClientLeftMessageRef = useRef<((msg: WebRTCSignalingMessage) => void) | null>(null);

  // Comprehensive cleanup function
  const cleanupResources = useCallback((reason: string = 'unknown') => {
    console.log(`🧹 Starting resource cleanup (reason: ${reason})`);

    // Clear any pending timeouts
    if (negotiationTimeoutRef.current) {
      clearTimeout(negotiationTimeoutRef.current);
      negotiationTimeoutRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Stop and cleanup local media stream
    if (localStreamRef.current) {
      console.log('🛑 Stopping local media tracks');
      try {
        localStreamRef.current.getTracks().forEach(track => {
          console.log(`  Stopping ${track.kind} track:`, track.id);
          track.stop();
        });
      } catch (err) {
        console.error('❌ Error stopping media tracks:', err);
      }
      localStreamRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      console.log('🛑 Closing peer connection');
      try {
        // Remove all event listeners by setting them to null
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onnegotiationneeded = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.onsignalingstatechange = null;

        // Close the connection
        if (pcRef.current.connectionState !== 'closed') {
          pcRef.current.close();
        }
      } catch (err) {
        console.error('❌ Error closing peer connection:', err);
      }
      pcRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      console.log('🛑 Closing WebSocket');
      try {
        // Remove event listeners
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;

        // Close the connection
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close(1000, 'cleanup');
        }
      } catch (err) {
        console.error('❌ Error closing WebSocket:', err);
      }
      wsRef.current = null;
    }

    // Cleanup remote participant streams
    setRemoteParticipants(prev => {
      if (prev.size > 0) {
        console.log('🛑 Cleaning up remote participant streams');
        prev.forEach((participant, id) => {
          try {
            participant.stream.getTracks().forEach(track => {
              console.log(`  Stopping remote ${track.kind} track for participant:`, id);
              track.stop();
            });
          } catch (err) {
            console.error(`❌ Error stopping tracks for participant ${id}:`, err);
          }
        });
      }
      return new Map();
    });

    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    // Reset all state
    setIsConnected(false);
    setIsMediaStarted(false);
    setIsAudioMuted(false);
    setIsVideoOff(false);
    setConnectionState('disconnected');
    setReconnectAttempts(0);
    setError(null);

    console.log('✅ Resource cleanup complete');
  }, []);

  useEffect(() => {
    setIsMounted(true);

    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audiooutput');
        setAudioOutputDevices(audioDevices);
        if (audioDevices.length > 0) {
          setSelectedAudioOutput(audioDevices[0].deviceId);
        }
      } catch (err) {
        console.error('Error enumerating devices:', err);
      }
    };

    getDevices();

    // Cleanup on unmount
    return () => {
      cleanupResources('component-unmount');
    };
  }, [cleanupResources]);

  useEffect(() => {
    remoteVideoRefs.current.forEach(videoEl => {
      if (videoEl && typeof videoEl.setSinkId === 'function') {
        videoEl.setSinkId(selectedAudioOutput);
      }
    });
  }, [selectedAudioOutput]);

  // Memoized computed values
  const connectionStatusColor = useMemo(() => {
    switch (connectionState) {
      case 'connected': return 'bg-green-400';
      case 'connecting':
      case 'reconnecting': return 'bg-yellow-400 animate-pulse';
      case 'failed': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  }, [connectionState]);

  const participantCount = useMemo(() => remoteParticipants.size + 1, [remoteParticipants.size]);

  const mediaStatus = useMemo(() => {
    if (!isMediaStarted || !localStreamRef.current) return '';
    const hasVideo = localStreamRef.current.getVideoTracks().length > 0;
    const hasAudio = localStreamRef.current.getAudioTracks().length > 0;
    return `${hasVideo ? '📹 ' : ''}${hasAudio ? '🎤' : ''}${!hasVideo && !hasAudio ? '⚠️ No media' : ''}`;
  }, [isMediaStarted]);

  const attemptReconnection = useCallback(() => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      setError('Failed to reconnect after multiple attempts. Please refresh the page and try again.');
      setConnectionState('failed');
      return;
    }

    setReconnectAttempts(prev => prev + 1);
    setConnectionState('reconnecting');

    console.log(`🔄 Attempting reconnection (${reconnectAttempts + 1}/${maxReconnectAttempts})...`);

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      // Try to re-establish the connection
      if (wsRef.current && wsRef.current.readyState === WebSocket.CLOSED) {
        console.log('🔌 Reconnecting WebSocket...');
        joinRoomRef.current?.();
      } else if (pcRef.current) {
        // Try to restart ICE
        console.log('🧊 Restarting ICE...');
        pcRef.current.restartIce();
      }
    }, 2000 * reconnectAttempts); // Exponential backoff
  }, [reconnectAttempts, maxReconnectAttempts]);
  attemptReconnectionRef.current = attemptReconnection;

  const handleAnswerMessage = useCallback(async (msg: WebRTCSignalingMessage, currentState: RTCSignalingState) => {
    console.log('📥 Received ANSWER from server');
    if (!msg.data || !('sdp' in msg.data)) {
      console.error('❌ Invalid answer message: missing data');
      return;
    }

    console.log('Answer SDP:', msg.data.sdp?.substring(0, 100) + '...');

    // Only set remote description if we're expecting an answer
    if (currentState === 'have-local-offer') {
      try {
        await pcRef.current!.setRemoteDescription(new RTCSessionDescription(msg.data));
        console.log('✅ Remote description (answer) set successfully');
      } catch (err) {
        console.error('❌ Failed to set remote description (answer):', err);
        setError('Failed to process answer from server');
      }
    } else {
      console.warn('⚠️ Ignoring answer - not in have-local-offer state, current state:', currentState);
    }
  }, []);
  handleAnswerMessageRef.current = handleAnswerMessage;

  const handleOfferMessage = useCallback(async (msg: WebRTCSignalingMessage, currentState: RTCSignalingState) => {
    console.log('📥 Received OFFER from server');
    if (!msg.data || !('sdp' in msg.data)) {
      console.error('❌ Invalid offer message: missing data');
      return;
    }

    console.log('Offer SDP:', msg.data.sdp?.substring(0, 100) + '...');

    try {
      // Handle offer based on current state
      if (currentState === 'stable' || currentState === 'have-remote-offer') {
        await pcRef.current!.setRemoteDescription(new RTCSessionDescription(msg.data));
        console.log('✅ Remote description (offer) set successfully');

        console.log('📤 Creating answer...');
        const answer = await pcRef.current!.createAnswer();
        await pcRef.current!.setLocalDescription(answer);
        console.log('✅ Local description (answer) set successfully');

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          console.log('📤 Sending answer to server');
          wsRef.current.send(JSON.stringify({ type: 'answer', data: pcRef.current!.localDescription }));
        } else {
          console.error('❌ WebSocket not ready to send answer');
          setError('Connection lost while processing offer');
        }
      } else if (currentState === 'have-local-offer') {
        // Rollback and apply remote offer (glare resolution)
        console.log('⚠️ Offer collision detected - rolling back local offer');
        await pcRef.current!.setRemoteDescription(new RTCSessionDescription(msg.data));
        console.log('✅ Remote description (offer) set after rollback');

        console.log('📤 Creating answer...');
        const answer = await pcRef.current!.createAnswer();
        await pcRef.current!.setLocalDescription(answer);
        console.log('✅ Local description (answer) set successfully');

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          console.log('📤 Sending answer to server');
          wsRef.current.send(JSON.stringify({ type: 'answer', data: pcRef.current!.localDescription }));
        } else {
          console.error('❌ WebSocket not ready to send answer after rollback');
          setError('Connection lost during glare resolution');
        }
      } else {
        console.warn('⚠️ Ignoring offer - unexpected state:', currentState);
        setError(`Received offer in unexpected signaling state: ${currentState}`);
      }
    } catch (err) {
      console.error('❌ Failed to process offer:', err);
      setError('Failed to process offer from server');
    }
  }, []);
  handleOfferMessageRef.current = handleOfferMessage;

  const handleCandidateMessage = useCallback(async (msg: WebRTCSignalingMessage) => {
    if (!msg.data) {
      console.log('📥 Received end-of-candidates indication');
      return;
    }

    if (!('candidate' in msg.data) || !msg.data.candidate) {
      console.warn('⚠️ Invalid candidate message: missing candidate data');
      return;
    }

    console.log('📥 Received ICE candidate:', (msg.data as RTCIceCandidateInit).candidate?.substring(0, 50) + '...');

    try {
      await pcRef.current!.addIceCandidate(new RTCIceCandidate(msg.data as RTCIceCandidateInit));
      console.log('✅ ICE candidate added successfully');
    } catch (err) {
      console.error('❌ Failed to add ICE candidate:', err);
      // Don't set error for individual candidate failures as they may be recoverable
    }
  }, []);
  handleCandidateMessageRef.current = handleCandidateMessage;

  const handleClientLeftMessage = useCallback((msg: WebRTCSignalingMessage) => {
    if (!msg.clientId) {
      console.warn('⚠️ Invalid client-left message: missing clientId');
      return;
    }

    const clientId = msg.clientId;
    console.log('👋 Client left:', clientId);
    // Remove participants - this will trigger when tracks end naturally
    // The onended handler will clean them up
  }, []);
  handleClientLeftMessageRef.current = handleClientLeftMessage;

  const handleMessage = useCallback(async (event: MessageEvent) => {
    try {
      const msg: WebRTCSignalingMessage = JSON.parse(event.data);
      console.log('📨 Received WebSocket message:', msg.type);

      if (!pcRef.current) {
        console.error('❌ No peer connection available');
        return;
      }

      const currentState = pcRef.current.signalingState;
      console.log('📊 Current signaling state:', currentState);

      // Validate message structure
      if (!msg.type) {
        console.error('❌ Invalid message: missing type');
        return;
      }

      switch (msg.type) {
        case 'answer':
          await handleAnswerMessageRef.current?.(msg, currentState);
          break;

        case 'offer':
          await handleOfferMessageRef.current?.(msg, currentState);
          break;

        case 'candidate':
          await handleCandidateMessageRef.current?.(msg);
          break;

        case 'client-left':
          handleClientLeftMessageRef.current?.(msg);
          break;

        default:
          console.warn('⚠️ Unknown message type:', msg.type);
      }
    } catch (err) {
      console.error('❌ WebRTC message error:', err);
      const error = err as WebRTCError;
      setError('Error handling WebRTC message: ' + (error.message || 'Unknown error'));
    }
  }, []);
  handleMessageRef.current = handleMessage;

  const joinRoom = useCallback(async () => {
    if (isConnected) {
      console.log('⚠️ Already connected, ignoring join request');
      return;
    }

    if (!room.trim()) {
      setError('Please enter a room name');
      return;
    }

    console.log('=== JOIN ROOM START ===');
    console.log('Room:', room);
    setIsJoining(true);
    setError(null);
    setConnectionState('connecting');

    try {
      const wsUrl = `wss://aqlaan.com/ws?room=${encodeURIComponent(room.trim())}`;
      console.log('Connecting to WebSocket:', wsUrl);

      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
          console.error('❌ WebSocket connection timeout');
          wsRef.current.close();
          setConnectionState('failed');
          setError('Connection timeout. Please check your internet connection and try again.');
          setIsJoining(false);
        }
      }, 10000); // 10 second timeout

      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        clearTimeout(connectionTimeout);
        setIsConnected(true);
        setIsJoining(false);
        try {
          console.log('Creating RTCPeerConnection...');
          pcRef.current = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ]
          });
          console.log('✅ RTCPeerConnection created');
          pcRef.current.onicecandidate = (event) => {
            if (event.candidate) {
              console.log('🧊 ICE Candidate generated:', event.candidate.candidate.substring(0, 50) + '...');
              if (wsRef.current) {
                wsRef.current.send(JSON.stringify({ type: 'candidate', data: event.candidate }));
              }
            } else {
              console.log('🧊 ICE Candidate gathering complete');
            }
          };
          
          pcRef.current.ontrack = (event) => {
            let stream: MediaStream;
            let streamId: string;
            
            if (!event.streams || event.streams.length === 0) {
              console.warn('⚠️ Received track without associated stream - creating new stream');
              // Create a new MediaStream for the track
              stream = new MediaStream([event.track]);
              streamId = `stream-${event.track.id}`;
              console.log('📝 Created new stream for orphaned track:', streamId);
            } else {
              stream = event.streams[0];
              streamId = stream.id;
            }
            
            const trackKind = event.track.kind;
            console.log('🎬 RECEIVED TRACK:', {
              kind: trackKind,
              streamId: streamId,
              trackId: event.track.id,
              readyState: event.track.readyState,
              enabled: event.track.enabled,
              muted: event.track.muted,
              streamTracks: stream.getTracks().length,
              hasAssociatedStreams: event.streams && event.streams.length > 0,
              transceiverMid: event.transceiver?.mid,
              transceiverDirection: event.transceiver?.direction
            });
            
            // Ensure audio tracks are enabled and not muted
            if (trackKind === 'audio') {
              event.track.enabled = true;
              console.log('🔊 Audio track enabled and unmuted');
            }
            
            // Listen for track ending
            event.track.onended = () => {
              console.log('🛑 Track ended:', trackKind, 'from stream:', streamId);
              setRemoteParticipants(prev => {
                const updated = new Map(prev);
                const participant = updated.get(streamId);
                if (participant) {
                  const remainingTracks = participant.stream.getTracks().filter(t => t.readyState === 'live');
                  if (remainingTracks.length === 0) {
                    console.log('❌ Removing participant (no active tracks):', streamId);
                    updated.delete(streamId);
                  }
                }
                return updated;
              });
            };
            
            // Listen for mute/unmute events
            event.track.onmute = () => {
              console.log('🔇 Track muted:', trackKind, 'from stream:', streamId);
            };
            
            event.track.onunmute = () => {
              console.log('🔊 Track unmuted:', trackKind, 'from stream:', streamId);
            };
            
            setRemoteParticipants(prev => {
              const updated = new Map(prev);
              const existing = updated.get(streamId);
              
              if (existing) {
                console.log('📝 Participant already exists:', streamId, 'Current tracks:', existing.stream.getTracks().length);
                // Check if this is a new track type being added
                const hasAudio = existing.stream.getAudioTracks().length > 0;
                const hasVideo = existing.stream.getVideoTracks().length > 0;
                const isNewAudio = trackKind === 'audio' && !hasAudio;
                const isNewVideo = trackKind === 'video' && !hasVideo;
                
                if (isNewAudio || isNewVideo) {
                  console.log(`➕ Adding new ${trackKind} track to existing participant`);
                  // Add the new track to the existing stream
                  if (!existing.stream.getTracks().find(t => t.id === event.track.id)) {
                    existing.stream.addTrack(event.track);
                  }
                }
                
                // Update with the potentially modified stream
                updated.set(streamId, {
                  ...existing,
                  stream: existing.stream,
                });
              } else {
                console.log('✨ Creating new participant:', streamId);
                updated.set(streamId, {
                  id: streamId,
                  stream: stream,
                  joinedAt: Date.now(),
                });
              }
              console.log('👥 Total remote participants:', updated.size);
              console.log('📊 Participants map:', Array.from(updated.keys()));
              return updated;
            });
          };
          // Handle renegotiation when tracks are added dynamically
          pcRef.current.onnegotiationneeded = async () => {
            console.log('🔄 Negotiation needed event fired');
            
            // Debounce to prevent duplicate offers
            if (negotiationTimeoutRef.current) {
              console.log('⏭️ Skipping negotiation - already scheduled');
              return;
            }
            
            negotiationTimeoutRef.current = setTimeout(async () => {
              negotiationTimeoutRef.current = null;
              console.log('🔄 Creating renegotiation offer');
              try {
                if (pcRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  const offer = await pcRef.current.createOffer();
                  await pcRef.current.setLocalDescription(offer);
                  console.log('📤 Sending renegotiation offer');
                  wsRef.current.send(JSON.stringify({ 
                    type: 'offer', 
                    data: pcRef.current.localDescription 
                  }));
                }
              } catch (err) {
                console.error('❌ Renegotiation failed:', err);
              }
            }, 100); // 100ms debounce
          };
          
          pcRef.current.oniceconnectionstatechange = () => {
            const state = pcRef.current?.iceConnectionState;
            console.log('🧊 ICE Connection State:', state);

            switch (state) {
              case 'connected':
                console.log('✅ ICE connection established successfully!');
                setConnectionState('connected');
                setReconnectAttempts(0); // Reset reconnection attempts on successful connection
                break;
              case 'disconnected':
                console.log('⚠️ ICE connection disconnected');
                setConnectionState('disconnected');
                setError('Connection lost. Attempting to reconnect...');
                // Attempt reconnection after a delay
                attemptReconnectionRef.current?.();
                break;
              case 'failed':
                console.log('❌ ICE connection failed');
                setConnectionState('failed');
                setError('ICE connection failed. This may be due to firewall or NAT issues. Please check your network settings.');
                // Cleanup resources on permanent failure
                cleanupResources('ice-connection-failed');
                break;
              case 'closed':
                console.log('❌ ICE connection closed');
                setConnectionState('disconnected');
                // Cleanup resources when connection is closed
                cleanupResources('ice-connection-closed');
                break;
            }
          };
          
          pcRef.current.onconnectionstatechange = () => {
            const state = pcRef.current?.connectionState;
            console.log('🔌 Connection State:', state);
          };
          
          pcRef.current.onsignalingstatechange = () => {
            const state = pcRef.current?.signalingState;
            console.log('📡 Signaling State:', state);
          };
          
          console.log('✅ All event handlers attached');
          
          // Add transceivers for receiving audio and video (receive-only)
          console.log('📡 Adding receive-only transceivers...');
          pcRef.current.addTransceiver('audio', { direction: 'recvonly' });
          pcRef.current.addTransceiver('video', { direction: 'recvonly' });
          console.log('✅ Receive-only transceivers added');
          
          // Create initial offer to join room as viewer (even without camera/mic)
          console.log('📤 Creating initial offer to join room...');
          (async () => {
            try {
              const offer = await pcRef.current!.createOffer();
              console.log('📝 Offer created:', offer.type);
              console.log('Offer SDP preview:', offer.sdp?.substring(0, 200) + '...');
              await pcRef.current!.setLocalDescription(offer);
              console.log('✅ Local description set');
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                console.log('📤 Sending offer to server');
                wsRef.current.send(JSON.stringify({ type: 'offer', data: pcRef.current!.localDescription }));
              } else {
                console.error('❌ WebSocket not ready to send offer');
              }
            } catch (err) {
              console.error('❌ Failed to create/send initial offer:', err);
            }
          })();
          
        } catch (err) {
          console.error('❌ Failed to create peer connection:', err);
          const error = err as WebRTCError;
          setError('Failed to create peer connection: ' + (error.message || 'Unknown error'));
        }
      };
      
      wsRef.current.onmessage = handleMessageRef.current;
      
      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        clearTimeout(connectionTimeout);
        setConnectionState('failed');
        setError('WebSocket connection failed. Please check if the server is running.');
        setIsJoining(false);
        // Cleanup resources on WebSocket error
        cleanupResources('websocket-error');
      };
      
      wsRef.current.onclose = (event) => {
        console.log('❌ WebSocket closed:', { code: event.code, reason: event.reason, wasClean: event.wasClean });
        clearTimeout(connectionTimeout);
        setIsConnected(false);
        setConnectionState('disconnected');

        // Only attempt reconnection for unexpected disconnections
        if (!event.wasClean && event.code !== 1000) {
          setError('Connection lost unexpectedly. Attempting to reconnect...');
          attemptReconnectionRef.current?.();
        } else if (event.wasClean && event.code === 1000) {
          // Clean disconnect (user initiated), cleanup resources
          cleanupResources('websocket-clean-close');
        }
      };
    } catch (err) {
      const error = err as WebRTCError;
      setError('Failed to connect to WebSocket: ' + (error.message || 'Unknown error'));
      setIsJoining(false);
    }
  }, [room, isConnected, cleanupResources]);
  joinRoomRef.current = joinRoom;

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
        console.log('🎤 Audio toggled:', audioTrack.enabled ? 'ON' : 'OFF');
      } else {
        console.warn('⚠️ No audio track available');
        setError('No microphone track available. You may have denied microphone permission or your device has no microphone.');
        setTimeout(() => setError(null), 5000);
      }
    } else {
      setError('Please start your camera/microphone first');
      setTimeout(() => setError(null), 3000);
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        console.log('📹 Video toggled:', videoTrack.enabled ? 'ON' : 'OFF');
      } else {
        console.warn('⚠️ No video track available');
        setError('No camera track available. You may have denied camera permission or your device has no camera.');
        setTimeout(() => setError(null), 5000);
      }
    } else {
      setError('Please start your camera/microphone first');
      setTimeout(() => setError(null), 3000);
    }
  }, []);

  const leaveRoom = useCallback(() => {
    console.log('=== LEAVE ROOM ===');
    cleanupResources('user-leave-room');
  }, [cleanupResources]);

  const startMedia = useCallback(async () => {
    if (isMediaStarted) return;
    console.log('=== START MEDIA ===');
    setIsStartingMedia(true);
    setError(null);
    
    try {
      // Check for media device support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Media devices not supported. This may be due to accessing the page over HTTP instead of HTTPS, or browser limitations.');
      }
      
      // Check permissions on Mac/Safari
      if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) {
        console.log('🧭 Safari detected - checking permissions...');
        try {
          // Test microphone permission
          const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          testStream.getTracks().forEach(track => track.stop()); // Clean up test stream
          console.log('✅ Microphone permission granted');
        } catch (permError) {
          const error = permError as Error;
          if (error.name === 'NotAllowedError') {
            setError('Microphone permission denied. On Mac with Safari, click the camera/microphone icon in the address bar and allow access.');
            setTimeout(() => setError(null), 10000);
            setIsStartingMedia(false);
            return;
          }
        }
      }
      
      // Try to get both video and audio, but fall back gracefully
      let stream: MediaStream | null = null;
      let hasVideo = false;
      let hasAudio = false;
      
      try {
        console.log('📹 Requesting camera and microphone access...');
        // Use specific audio constraints for better Mac compatibility
        const constraints = {
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 2 }
          }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        hasVideo = stream.getVideoTracks().length > 0;
        hasAudio = stream.getAudioTracks().length > 0;
        console.log(`✅ Got media - Video: ${hasVideo}, Audio: ${hasAudio}`);
      } catch (videoError) {
        console.warn('⚠️ Failed to get video+audio, trying alternatives:', videoError);
        // Check if it's a permission error on Mac
        const error = videoError as Error;
        if (error.name === 'NotAllowedError') {
          console.warn('🚫 Permission denied - this is common on Mac/Safari');
          setError('Camera/microphone permission denied. On Mac, please check System Settings > Privacy & Security > Camera/Microphone and allow access for your browser.');
          setTimeout(() => setError(null), 8000);
        }
        try {
          // Try audio only with specific constraints
          console.log('🎤 Trying audio only...');
          const audioConstraints = {
            video: false,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: { ideal: 48000 },
              channelCount: { ideal: 2 }
            }
          };
          stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
          hasAudio = stream.getAudioTracks().length > 0;
          console.log(`✅ Got audio only - Audio: ${hasAudio}`);
          setIsVideoOff(true);
        } catch (audioError) {
          console.warn('⚠️ Audio failed, trying video only:', audioError);
          const error = audioError as Error;
          if (error.name === 'NotAllowedError') {
            console.warn('🚫 Audio permission denied');
            setError('Microphone permission denied. On Mac, please check System Settings > Privacy & Security > Microphone.');
            setTimeout(() => setError(null), 8000);
          }
          try {
            // Try video only
            console.log('📹 Trying video only...');
            stream = await navigator.mediaDevices.getUserMedia({ 
              video: {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 30, max: 60 }
              }, 
              audio: false 
            });
            hasVideo = stream.getVideoTracks().length > 0;
            console.log(`✅ Got video only - Video: ${hasVideo}`);
            setIsAudioMuted(true);
          } catch (videoOnlyError) {
            const error = videoOnlyError as Error;
            if (error.name === 'NotAllowedError') {
              console.warn('🚫 Video permission denied');
              setError('Camera permission denied. On Mac, please check System Settings > Privacy & Security > Camera.');
              setTimeout(() => setError(null), 8000);
            }
            throw new Error('Could not access any media devices (camera or microphone)');
          }
        }
      }
      
      if (!stream) {
        throw new Error('Could not access any media devices');
      }
      
      localStreamRef.current = stream;
      console.log('✅ Media access granted');
      console.log('Stream details:', {
        audioTracks: stream.getAudioTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled })),
        videoTracks: stream.getVideoTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled }))
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setIsMediaStarted(true);
      
      // Update UI state based on what we actually got
      if (!hasVideo) {
        setIsVideoOff(true);
        console.log('⚠️ No video track available');
      }
      if (!hasAudio) {
        setIsAudioMuted(true);
        console.log('⚠️ No audio track available');
      }
      
      if (pcRef.current && wsRef.current) {
        console.log('📤 Adding tracks to peer connection...');
        
        // Get existing transceivers
        const transceivers = pcRef.current.getTransceivers();
        console.log('Current transceivers:', transceivers.map(t => ({ 
          mid: t.mid, 
          direction: t.direction, 
          kind: t.receiver.track.kind 
        })));
        
        localStreamRef.current.getTracks().forEach(track => {
          console.log('  Adding track:', track.kind, track.id, 'enabled:', track.enabled);
          
          // Find existing transceiver for this kind and update direction
          const transceiver = transceivers.find(t => t.receiver.track.kind === track.kind);
          if (transceiver) {
            console.log(`  Updating transceiver for ${track.kind} from ${transceiver.direction} to sendrecv`);
            transceiver.direction = 'sendrecv';
            transceiver.sender.replaceTrack(track);
          } else {
            // Fallback: add track normally (shouldn't happen with our setup)
            console.log(`  Adding new transceiver for ${track.kind}`);
            pcRef.current!.addTrack(track, localStreamRef.current!);
          }
        });
        
        console.log('Updated transceivers:', pcRef.current.getTransceivers().map(t => ({ 
          mid: t.mid, 
          direction: t.direction, 
          kind: t.receiver.track.kind 
        })));
        
        // Renegotiation will be handled automatically by onnegotiationneeded event
        console.log('✅ Tracks added - waiting for automatic renegotiation');
      }
    } catch (err) {
      console.error('❌ Failed to start media:', err);
      const error = err as WebRTCError;
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
    } finally {
      setIsStartingMedia(false);
    }
  }, [isMediaStarted]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">AqLinks Video Conference</h1>
            {isConnected && (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connectionStatusColor}`} />
                <span className="text-sm text-gray-300 capitalize">{connectionState}</span>
              </div>
            )}
          </div>
          {isMounted && (
            <div className="flex items-center gap-4">
              {!isConnected ? (
                <div className="flex items-center gap-3">
                  <input
                    id="room"
                    type="text"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    placeholder="Room name"
                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                    disabled={isConnected}
                  />
                  <button
                    onClick={joinRoom}
                    disabled={isConnected || isJoining}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isJoining ? 'Joining...' : 'Join Room'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={leaveRoom}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                >
                  Leave Room
                </button>
              )}
            </div>
          )}
        </div>
      </div>

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
        ) : !isConnected ? (
          <div className="flex items-center justify-center h-[calc(100vh-200px)]">
            <div className="text-center">
              <div className="text-6xl mb-4">🎥</div>
              <h2 className="text-2xl font-semibold mb-2">Ready to join?</h2>
              <p className="text-gray-400">Enter a room name and click "Join Room" to start</p>
            </div>
          </div>
        ) : (
          <>
            {/* Video Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
              {/* Local Video */}
              <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                  <span>You</span>
                  {isMediaStarted && (
                    <>
                      {isVideoOff && <span className="text-red-400">📷</span>}
                      {isAudioMuted && <span className="text-red-400">🔇</span>}
                      {!isVideoOff && !isAudioMuted && <span className="text-green-400">✓</span>}
                    </>
                  )}
                </div>
                {(isVideoOff || !isMediaStarted) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    <div className="text-center">
                      <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center text-4xl mx-auto mb-2">
                        👤
                      </div>
                      {!isMediaStarted ? (
                        <p className="text-sm text-gray-400">Camera not started</p>
                      ) : (
                        <p className="text-sm text-gray-400">Camera off</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Remote Participants */}
              {Array.from(remoteParticipants.values()).map((participant) => {
                const hasVideo = participant.stream.getVideoTracks().length > 0;
                const audioTrack = participant.stream.getAudioTracks()[0];
                const videoTrack = participant.stream.getVideoTracks()[0];
                const isAudioEnabled = audioTrack?.enabled ?? false;
                const isVideoEnabled = videoTrack?.enabled ?? false;
                
                // Ensure audio tracks are enabled when received
                if (audioTrack && !audioTrack.enabled) {
                  console.log('🔊 Enabling received audio track for participant:', participant.id);
                  audioTrack.enabled = true;
                }
                
                console.log('🖼️ Rendering participant:', participant.id, 'Tracks:', participant.stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, muted: t.muted })));
                return (
                  <div key={participant.id} className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
                    <video
                      autoPlay
                      playsInline
                      ref={(el) => {
                        if (el) {
                          remoteVideoRefs.current.set(participant.id, el);
                          console.log('📺 Video element ref callback for:', participant.id, {
                            currentSrcObject: el.srcObject,
                            newStream: participant.stream,
                            streamTracks: participant.stream.getTracks().length,
                            needsUpdate: el.srcObject !== participant.stream
                          });
                          if (el.srcObject !== participant.stream) {
                            console.log('🔄 Setting srcObject for participant:', participant.id);
                            el.srcObject = participant.stream;
                            if (typeof el.setSinkId === 'function') {
                              el.setSinkId(selectedAudioOutput).catch(err => {
                                console.error('Error setting sinkId:', err);
                              });
                            }
                            el.play().catch(e => console.error('▶️ Play error:', e));
                          }
                        } else {
                          remoteVideoRefs.current.delete(participant.id);
                        }
                      }}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                      <span>Participant {participant.id.substring(0, 8)}</span>
                      {!isVideoEnabled && <span className="text-red-400">📷</span>}
                      {!isAudioEnabled && <span className="text-red-400">🔇</span>}
                    </div>
                    {/* Show placeholder when video is off */}
                    {!hasVideo || !isVideoEnabled ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                        <div className="text-center">
                          <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center text-4xl mx-auto mb-2">
                            👤
                          </div>
                          <p className="text-sm text-gray-400">
                            {!hasVideo ? 'No camera' : 'Camera off'}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {/* Empty State */}
              {remoteParticipants.size === 0 && (
                <div className="bg-gray-800 rounded-lg aspect-video flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <div className="text-4xl mb-2">👥</div>
                    <p>Waiting for others to join...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-center gap-4">
                {!isMediaStarted ? (
                  <>
                    <button
                      onClick={startMedia}
                      disabled={isStartingMedia}
                      className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      <span className="text-xl">🎥</span>
                      {isStartingMedia ? 'Starting...' : 'Start Camera & Mic'}
                    </button>
                    <div className="text-gray-400 text-sm">
                      (Optional - you can watch without sharing)
                    </div>
                  </>
                ) : (
                  <>
                    {(localStreamRef.current?.getAudioTracks().length ?? 0) > 0 ? (
                      <button
                        onClick={toggleAudio}
                        className={`p-4 rounded-full font-medium transition-colors ${
                          isAudioMuted
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                        title={isAudioMuted ? "Unmute" : "Mute"}
                      >
                        <span className="text-2xl">{isAudioMuted ? '🔇' : '🎤'}</span>
                      </button>
                    ) : (
                      <div className="p-4 rounded-full bg-gray-600 opacity-50 cursor-not-allowed" title="No microphone available">
                        <span className="text-2xl">🔇</span>
                      </div>
                    )}
                    
                    {(localStreamRef.current?.getVideoTracks().length ?? 0) > 0 ? (
                      <button
                        onClick={toggleVideo}
                        className={`p-4 rounded-full font-medium transition-colors ${
                          isVideoOff
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                        title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                      >
                        <span className="text-2xl">{isVideoOff ? '📷' : '🎥'}</span>
                      </button>
                    ) : (
                      <div className="p-4 rounded-full bg-gray-600 opacity-50 cursor-not-allowed" title="No camera available">
                        <span className="text-2xl">📷</span>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="text-center text-gray-400 text-sm mt-4">
                Room: <span className="text-white font-medium">{room}</span> • 
                Participants: <span className="text-white font-medium">{participantCount}</span>
                {isMediaStarted && localStreamRef.current && (
                  <>
                    {' • '}
                    <span className="text-white font-medium">
                      {mediaStatus}
                    </span>
                  </>
                )}
              </div>
              {audioOutputDevices.length > 0 && (
                <div className="mt-4 flex justify-center items-center gap-2">
                  <label htmlFor="audio-output" className="text-sm text-gray-400">Audio Output:</label>
                  <select
                    id="audio-output"
                    value={selectedAudioOutput}
                    onChange={(e) => setSelectedAudioOutput(e.target.value)}
                    className="px-3 py-1 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                  >
                    {audioOutputDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
