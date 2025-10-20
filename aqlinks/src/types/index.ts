// TypeScript types for the AqLinks video conferencing application

export interface WebRTCSignalingMessage {
  type: 'offer' | 'answer' | 'candidate' | 'client-left';
  data?: RTCSessionDescriptionInit | RTCIceCandidateInit | null;
  clientId?: string;
}

export interface ICECandidateMessage {
  type: 'candidate';
  data: RTCIceCandidateInit | null;
}

export interface SDPSessionMessage {
  type: 'offer' | 'answer';
  data: RTCSessionDescriptionInit;
}

export interface ClientLeftMessage {
  type: 'client-left';
  clientId: string;
}

export type SignalingMessage = ICECandidateMessage | SDPSessionMessage | ClientLeftMessage;

export interface RemoteParticipant {
  id: string;
  stream: MediaStream;
  videoElement?: HTMLVideoElement;
  audioElement?: HTMLAudioElement;
  clientId?: string;
  joinedAt?: number;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed' | 'reconnecting';

export interface MediaConstraints {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
}

export interface WebRTCError extends Error {
  code?: number;
  details?: unknown;
}

// WebRTC Peer Connection event handlers
export interface PeerConnectionHandlers {
  onicecandidate?: (event: RTCPeerConnectionIceEvent) => void;
  ontrack?: (event: RTCTrackEvent) => void;
  onnegotiationneeded?: () => void;
  oniceconnectionstatechange?: () => void;
  onconnectionstatechange?: () => void;
  onsignalingstatechange?: () => void;
}

// WebSocket event handlers
export interface WebSocketHandlers {
  onopen?: (event: Event) => void;
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: Event) => void;
  onclose?: (event: CloseEvent) => void;
}

// Media track states
export interface TrackState {
  enabled: boolean;
  muted: boolean;
  readyState: MediaStreamTrackState;
  id: string;
  kind: 'audio' | 'video';
  label: string;
}
