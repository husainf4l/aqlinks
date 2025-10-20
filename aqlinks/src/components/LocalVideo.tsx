import React, { useRef, useEffect } from 'react';

interface LocalVideoProps {
  stream: MediaStream | null;
  isMediaStarted: boolean;
  isVideoOff: boolean;
  isAudioMuted: boolean;
}

export function LocalVideo({ stream, isMediaStarted, isVideoOff, isAudioMuted }: LocalVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
      <video
        ref={videoRef}
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
  );
}
