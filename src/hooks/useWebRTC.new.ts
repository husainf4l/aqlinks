import { useRef, useCallback, useState } from 'react';
import { RemoteParticipant, WebRTCSignalingMessage, ConnectionState } from '../types';

export interface UseWebRTCReturn {
  peerConnection: RTCPeerConnection | null;
  remoteParticipants: Map<string, RemoteParticipant>;
  connectionState: ConnectionState;
  createPeerConnection: (
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onTrack: (event: RTCTrackEvent) => void,
    onConnectionStateChange: (state: ConnectionState) => void
  ) => RTCPeerConnection;
  closePeerConnection: () => void;
  addTrack: (track: MediaStreamTrack, stream: MediaStream) => void;
  handleSignalingMessage: (msg: WebRTCSignalingMessage, sendMessage: (msg: WebRTCSignalingMessage) => void) => Promise<void>;
}

export function useWebRTC(): UseWebRTCReturn {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, RemoteParticipant>>(new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Create a new peer connection
  const createPeerConnection = useCallback(
    (
      onIceCandidate: (candidate: RTCIceCandidate) => void,
      onTrack: (event: RTCTrackEvent) => void,
      onConnectionStateChange: (state: ConnectionState) => void
    ): RTCPeerConnection => {
      console.log('🔌 Creating new RTCPeerConnection');
      
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
      });

      // Don't pre-create transceivers - let addTrack() create them automatically
      // This follows MDN documentation and Pion WebRTC examples
      console.log('✅ PeerConnection created');

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 New ICE candidate:', event.candidate.candidate);
          onIceCandidate(event.candidate);
        } else {
          console.log('🧊 ICE gathering complete');
        }
      };

      pc.ontrack = (event) => {
        console.log('🎬 RECEIVED TRACK:', event.track.kind);
        
        let stream: MediaStream;
        let streamId: string;
        
        if (!event.streams || event.streams.length === 0) {
          stream = new MediaStream([event.track]);
          streamId = `stream-${event.track.id}`;
        } else {
          stream = event.streams[0];
          streamId = stream.id;
        }

        if (event.track.kind === 'audio') {
          event.track.enabled = true;
        }

        setRemoteParticipants(prev => {
          const updated = new Map(prev);
          const existing = updated.get(streamId);
          
          if (existing) {
            if (!existing.stream.getTracks().find(t => t.id === event.track.id)) {
              existing.stream.addTrack(event.track);
            }
            updated.set(streamId, { ...existing, stream: existing.stream });
          } else {
            updated.set(streamId, {
              id: streamId,
              stream: stream,
              joinedAt: Date.now(),
            });
          }
          
          return updated;
        });

        onTrack(event);
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log('🧊 ICE Connection State:', state);
        
        let mappedState: ConnectionState = 'disconnected';
        if (state === 'connected') {
          mappedState = 'connected';
          setConnectionState('connected');
        } else if (state === 'disconnected' || state === 'failed') {
          mappedState = 'disconnected';
          setConnectionState('disconnected');
        } else if (state === 'checking' || state === 'new') {
          mappedState = 'connecting';
          setConnectionState('connecting');
        }
        
        onConnectionStateChange(mappedState);
      };

      pc.onconnectionstatechange = () => {
        console.log('🔗 Connection State:', pc.connectionState);
      };

      peerConnectionRef.current = pc;
      return pc;
    },
    []
  );

  // Close peer connection
  const closePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      console.log('🛑 Closing peer connection');
      try {
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.onconnectionstatechange = null;

        if (peerConnectionRef.current.connectionState !== 'closed') {
          peerConnectionRef.current.close();
        }
      } catch (err) {
        console.error('❌ Error closing peer connection:', err);
      }
      peerConnectionRef.current = null;
    }

    pendingCandidatesRef.current = [];

    setRemoteParticipants(prev => {
      prev.forEach((participant) => {
        participant.stream.getTracks().forEach(track => track.stop());
      });
      return new Map();
    });

    setConnectionState('disconnected');
  }, []);

  // Add a media track using standard addTrack() - best practice per MDN
  const addTrack = useCallback(
    (track: MediaStreamTrack, stream: MediaStream) => {
      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error('❌ Cannot add track: No peer connection');
        return;
      }

      console.log(`🎬 Adding ${track.kind} track:`, {
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        readyState: track.readyState,
      });

      try {
        // Use standard addTrack() - this is the WebRTC best practice
        // It automatically creates a transceiver with sendrecv direction
        const sender = pc.addTrack(track, stream);
        console.log(`✅ ${track.kind} track added successfully`);
        console.log(`   Sender track:`, sender.track?.kind, sender.track?.id);
        
        // Log the transceivers
        const transceivers = pc.getTransceivers();
        console.log(`📊 PeerConnection now has ${transceivers.length} transceivers:`);
        transceivers.forEach((t, i) => {
          console.log(`   [${i}] ${t.receiver.track.kind}: direction=${t.direction}, mid=${t.mid || '(pending)'}, senderTrack=${t.sender.track?.id || 'null'}`);
        });
      } catch (err) {
        console.error(`❌ Error adding ${track.kind} track:`, err);
        throw err;
      }
    },
    []
  );

  // Handle signaling messages
  const handleSignalingMessage = useCallback(
    async (
      msg: WebRTCSignalingMessage,
      sendMessage: (msg: WebRTCSignalingMessage) => void
    ) => {
      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error('❌ No peer connection available');
        return;
      }

      const currentState = pc.signalingState;
      console.log(`📨 Handling message type: ${msg.type}, current signaling state: ${currentState}`);

      switch (msg.type) {
        case 'offer':
          if (!msg.data || !('sdp' in msg.data)) {
            console.error('❌ Invalid offer message');
            return;
          }

          console.log('📥 Received offer from server');
          console.log('📊 Transceivers BEFORE setRemoteDescription:', 
            pc.getTransceivers().map(t => ({
              mid: t.mid,
              kind: t.receiver.track.kind,
              direction: t.direction,
              senderTrack: t.sender.track?.id || 'null'
            }))
          );

          await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
          console.log('✅ Remote description (offer) set');

          console.log('📊 Transceivers AFTER setRemoteDescription:', 
            pc.getTransceivers().map(t => ({
              mid: t.mid,
              kind: t.receiver.track.kind,
              direction: t.direction,
              senderTrack: t.sender.track?.id || 'null'
            }))
          );

          const answer = await pc.createAnswer();
          console.log('📝 Created answer');
          console.log('📄 Answer SDP:', answer.sdp);

          await pc.setLocalDescription(answer);
          console.log('✅ Local description (answer) set');

          sendMessage({ type: 'answer', data: answer });
          console.log('📤 Sent answer to server');

          // Add any pending ICE candidates
          if (pendingCandidatesRef.current.length > 0) {
            console.log(`📥 Adding ${pendingCandidatesRef.current.length} pending ICE candidates`);
            for (const candidate of pendingCandidatesRef.current) {
              try {
                await pc.addIceCandidate(candidate);
                console.log('✅ Pending ICE candidate added');
              } catch (err) {
                console.error('❌ Error adding pending candidate:', err);
              }
            }
            pendingCandidatesRef.current = [];
          }
          break;

        case 'answer':
          if (!msg.data || !('sdp' in msg.data)) {
            console.error('❌ Invalid answer message');
            return;
          }
          if (currentState === 'have-local-offer') {
            console.log('📥 Received answer from server');
            await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
            console.log('✅ Remote description (answer) set');
            
            // Add any pending ICE candidates
            if (pendingCandidatesRef.current.length > 0) {
              console.log(`📥 Adding ${pendingCandidatesRef.current.length} pending ICE candidates`);
              for (const candidate of pendingCandidatesRef.current) {
                try {
                  await pc.addIceCandidate(candidate);
                  console.log('✅ Pending ICE candidate added');
                } catch (err) {
                  console.error('❌ Error adding pending candidate:', err);
                }
              }
              pendingCandidatesRef.current = [];
            }
          } else {
            console.warn(`⚠️ Received answer in unexpected state: ${currentState}`);
          }
          break;

        case 'candidate':
          if (!msg.data || !('candidate' in msg.data)) {
            console.error('❌ Invalid candidate message');
            return;
          }

          console.log('📥 Received ICE candidate');
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(msg.data);
              console.log('✅ ICE candidate added');
            } catch (err) {
              console.error('❌ Error adding ICE candidate:', err);
            }
          } else {
            console.log('⏳ Queuing ICE candidate (no remote description yet)');
            pendingCandidatesRef.current.push(msg.data);
          }
          break;

        default:
          console.warn('⚠️ Unknown message type:', msg.type);
      }
    },
    []
  );

  return {
    peerConnection: peerConnectionRef.current,
    remoteParticipants,
    connectionState,
    createPeerConnection,
    closePeerConnection,
    addTrack,
    handleSignalingMessage,
  };
}
