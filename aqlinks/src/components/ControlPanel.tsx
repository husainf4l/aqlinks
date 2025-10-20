import React from 'react';

interface ControlPanelProps {
  isMediaStarted: boolean;
  isStartingMedia: boolean;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  hasAudioTrack: boolean;
  hasVideoTrack: boolean;
  room: string;
  participantCount: number;
  mediaStatus: string;
  audioOutputDevices: MediaDeviceInfo[];
  selectedAudioOutput: string;
  onStartMedia: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onAudioOutputChange: (deviceId: string) => void;
}

export function ControlPanel({
  isMediaStarted,
  isStartingMedia,
  isAudioMuted,
  isVideoOff,
  hasAudioTrack,
  hasVideoTrack,
  room,
  participantCount,
  mediaStatus,
  audioOutputDevices,
  selectedAudioOutput,
  onStartMedia,
  onToggleAudio,
  onToggleVideo,
  onAudioOutputChange,
}: ControlPanelProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-center gap-4">
        {!isMediaStarted ? (
          <>
            <button
              onClick={onStartMedia}
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
            {hasAudioTrack ? (
              <button
                onClick={onToggleAudio}
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
            
            {hasVideoTrack ? (
              <button
                onClick={onToggleVideo}
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
        {isMediaStarted && mediaStatus && (
          <>
            {' • '}
            <span className="text-white font-medium">{mediaStatus}</span>
          </>
        )}
      </div>
      
      {audioOutputDevices.length > 0 && (
        <div className="mt-4 flex justify-center items-center gap-2">
          <label htmlFor="audio-output" className="text-sm text-gray-400">Audio Output:</label>
          <select
            id="audio-output"
            value={selectedAudioOutput}
            onChange={(e) => onAudioOutputChange(e.target.value)}
            className="px-3 py-1 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
          >
            {audioOutputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
