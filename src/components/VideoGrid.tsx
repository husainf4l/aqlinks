import React from 'react';
import { LocalVideo } from './LocalVideo';
import { ParticipantVideo } from './ParticipantVideo';
import { RemoteParticipant } from '../types';

interface VideoGridProps {
  localStream: MediaStream | null;
  isMediaStarted: boolean;
  isVideoOff: boolean;
  isAudioMuted: boolean;
  remoteParticipants: Map<string, RemoteParticipant>;
  selectedAudioOutput: string;
}

export function VideoGrid({
  localStream,
  isMediaStarted,
  isVideoOff,
  isAudioMuted,
  remoteParticipants,
  selectedAudioOutput,
}: VideoGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
      {/* Local Video */}
      <LocalVideo
        stream={localStream}
        isMediaStarted={isMediaStarted}
        isVideoOff={isVideoOff}
        isAudioMuted={isAudioMuted}
      />

      {/* Remote Participants */}
      {Array.from(remoteParticipants.values()).map((participant) => (
        <ParticipantVideo
          key={participant.id}
          participant={participant}
          selectedAudioOutput={selectedAudioOutput}
        />
      ))}

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
  );
}
