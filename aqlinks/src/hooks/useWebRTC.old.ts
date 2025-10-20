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
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, RemoteParticipant>>(new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const negotiationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const createPeerConnection = useCallback((
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onTrack: (event: RTCTrackEvent) => void,
    onConnectionStateChange: (state: ConnectionState) => void
  ): RTCPeerConnection => {
    console.log('Creating RTCPeerConnection...');
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 ICE Candidate generated');
        onIceCandidate(event.candidate);
      } else {
        console.log('🧊 ICE Candidate gathering complete');
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
          const hasAudio = existing.stream.getAudioTracks().length > 0;
          const hasVideo = existing.stream.getVideoTracks().length > 0;
          const isNewAudio = event.track.kind === 'audio' && !hasAudio;
          const isNewVideo = event.track.kind === 'video' && !hasVideo;
          
          if (isNewAudio || isNewVideo) {
            if (!existing.stream.getTracks().find(t => t.id === event.track.id)) {
              existing.stream.addTrack(event.track);
            }
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

    pc.onnegotiationneeded = async () => {
      console.log('🔄 Negotiation needed event fired');
      
      if (negotiationTimeoutRef.current) {
        return;
      }
      
      negotiationTimeoutRef.current = setTimeout(() => {
        negotiationTimeoutRef.current = null;
      }, 100);
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log('🧊 ICE Connection State:', state);

      switch (state) {
        case 'connected':
          setConnectionState('connected');
          onConnectionStateChange('connected');
          break;
        case 'disconnected':
          setConnectionState('disconnected');
          onConnectionStateChange('disconnected');
          break;
        case 'failed':
          setConnectionState('failed');
          onConnectionStateChange('failed');
          break;
        case 'closed':
          setConnectionState('disconnected');
          onConnectionStateChange('disconnected');
          break;
      }
    };

    // Add transceivers with sendrecv to handle bidirectional media  
    // This is required for SFU architecture - we need to be ready to send AND receive
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.addTransceiver('video', { direction: 'sendrecv' });
    console.log('✅ Added audio and video transceivers with sendrecv direction');

    pcRef.current = pc;
    return pc;
  }, []);

  const closePeerConnection = useCallback(() => {
    if (pcRef.current) {
      console.log('🛑 Closing peer connection');
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onnegotiationneeded = null;
        pcRef.current.oniceconnectionstatechange = null;

        if (pcRef.current.connectionState !== 'closed') {
          pcRef.current.close();
        }
      } catch (err) {
        console.error('❌ Error closing peer connection:', err);
      }
      pcRef.current = null;
    }

    // Clear pending candidates
    pendingCandidatesRef.current = [];

    setRemoteParticipants(prev => {
      prev.forEach((participant) => {
        participant.stream.getTracks().forEach(track => track.stop());
      });
      return new Map();
    });

    setConnectionState('disconnected');
  }, []);

  const addTrack = useCallback(async (track: MediaStreamTrack, stream: MediaStream) => {
    if (pcRef.current) {
      console.log(`🎬 Adding ${track.kind} track to peer connection`, { 
        trackId: track.id, 
        enabled: track.enabled,
        readyState: track.readyState 
      });
      
      // Find the transceiver for this track kind
      const transceivers = pcRef.current.getTransceivers();
      const transceiver = transceivers.find(t => 
        t.receiver.track.kind === track.kind && 
        !t.sender.track
      );
      
      if (transceiver) {
        console.log(`🔄 Using existing ${track.kind} transceiver, replacing track`);
        await transceiver.sender.replaceTrack(track);
        console.log(`✅ ${track.kind} track set in transceiver`);
      } else {
        console.log(`➕ No empty transceiver found, adding ${track.kind} track directly`);
        const sender = pcRef.current.addTrack(track, stream);
        console.log(`✅ ${track.kind} track added, sender:`, { 
          track: sender.track?.kind, 
          trackId: sender.track?.id 
        });
      }
      
      // Log all transceivers
      console.log(`📊 All transceivers after adding ${track.kind}:`, 
        pcRef.current.getTransceivers().map(t => ({
          mid: t.mid,
          kind: t.receiver.track.kind,
          direction: t.direction,
          senderTrack: t.sender.track?.id || 'null'
        }))
      );
    }
  }, []);

  const handleSignalingMessage = useCallback(async (
    msg: WebRTCSignalingMessage,
    sendMessage: (msg: WebRTCSignalingMessage) => void
  ) => {
    if (!pcRef.current) {
      console.error('❌ No peer connection available');
      return;
    }

    const currentState = pcRef.current.signalingState;

    switch (msg.type) {
      case 'answer':
        if (!msg.data || !('sdp' in msg.data)) {
          console.error('❌ Invalid answer message');
          return;
        }
        if (currentState === 'have-local-offer') {
          console.log('📥 Received answer from server');
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.data));
          console.log('✅ Remote description (answer) set');
          
          // Add any pending ICE candidates
          if (pendingCandidatesRef.current.length > 0) {
            console.log(`📥 Adding ${pendingCandidatesRef.current.length} pending ICE candidates`);
            for (const candidate of pendingCandidatesRef.current) {
              try {
                if (pcRef.current.signalingState !== 'closed') {
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                }
              } catch (err) {
                const error = err as Error;
                if (!error.message?.includes('current state is closed')) {
                  console.warn('⚠️ Failed to add pending ICE candidate:', error.message);
                }
              }
            }
            pendingCandidatesRef.current = [];
          }
        }
        break;

      case 'offer':
        if (!msg.data || !('sdp' in msg.data)) {
          console.error('❌ Invalid offer message');
          return;
        }
        console.log('📥 Received offer from server (renegotiation)');
        console.log('📊 Current transceivers BEFORE setRemoteDescription:', pcRef.current.getTransceivers().map(t => ({
          mid: t.mid,
          direction: t.direction,
          kind: t.receiver.track.kind,
          senderTrack: t.sender.track?.id || 'null',
          senderTrackEnabled: t.sender.track?.enabled
        })));
        
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.data));
        console.log('✅ Remote description (offer) set');
        
        console.log('📊 Transceivers AFTER setRemoteDescription:', pcRef.current.getTransceivers().map(t => ({
          mid: t.mid,
          direction: t.direction,
          kind: t.receiver.track.kind,
          senderTrack: t.sender.track?.id || 'null'
        })));
        
        const answer = await pcRef.current.createAnswer();
        console.log('📝 Created answer:', {
          type: answer.type,
          hasSdp: !!answer.sdp,
          sdpLength: answer.sdp?.length || 0,
          sdpPreview: answer.sdp?.substring(0, 300)
        });
        console.log('📝 Full answer SDP:', answer.sdp);
        
        await pcRef.current.setLocalDescription(answer);
        console.log('📤 Sending answer to server');
        sendMessage({ type: 'answer', data: pcRef.current.localDescription });
        
        // Add any pending ICE candidates
        if (pendingCandidatesRef.current.length > 0) {
          console.log(`📥 Adding ${pendingCandidatesRef.current.length} pending ICE candidates`);
          for (const candidate of pendingCandidatesRef.current) {
            try {
              if (pcRef.current.signalingState !== 'closed') {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
              }
            } catch (err) {
              const error = err as Error;
              if (!error.message?.includes('current state is closed')) {
                console.warn('⚠️ Failed to add pending ICE candidate:', error.message);
              }
            }
          }
          pendingCandidatesRef.current = [];
        }
        break;

      case 'candidate':
        if (!msg.data || !('candidate' in msg.data) || !msg.data.candidate) {
          return;
        }
        
        // Check if remote description is set
        if (pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.data as RTCIceCandidateInit));
            console.log('✅ ICE candidate added');
          } catch (err) {
            const error = err as Error;
            // Only log non-AbortError issues
            if (!error.message?.includes('current state is closed')) {
              console.warn('⚠️ Failed to add ICE candidate:', error.message);
            }
          }
        } else {
          // Queue the candidate for later
          console.log('📦 Queuing ICE candidate (remote description not set yet)');
          pendingCandidatesRef.current.push(msg.data as RTCIceCandidateInit);
        }
        break;

      case 'client-left':
        console.log('👋 Client left:', msg.clientId);
        break;
    }
  }, []);

  return {
    peerConnection: pcRef.current,
    remoteParticipants,
    connectionState,
    createPeerConnection,
    closePeerConnection,
    addTrack,
    handleSignalingMessage,
  };
}
