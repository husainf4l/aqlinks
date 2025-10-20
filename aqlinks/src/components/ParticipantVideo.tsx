import React, { useRef, useEffect } from 'react';
import { RemoteParticipant } from '../types';

interface ParticipantVideoProps {
  participant: RemoteParticipant;
  selectedAudioOutput: string;
}

export function ParticipantVideo({ participant, selectedAudioOutput }: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const streamSetRef = useRef<MediaStream | null>(null);

  // Set stream and play immediately
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !participant.stream) return;

    const setupStream = async () => {
      try {
        // Only update if stream changed
        if (streamSetRef.current === participant.stream) return;
        streamSetRef.current = participant.stream;

        // Wait for any pending play promise
        if (playPromiseRef.current) {
          try {
            await playPromiseRef.current;
          } catch {
            // Ignore
          }
        }

        // Set stream and play immediately - don't wait for metadata
        videoElement.srcObject = participant.stream;
        
        // Enable audio tracks immediately
        participant.stream.getAudioTracks().forEach(track => {
          if (!track.enabled) {
            console.log('🔊 Enabling audio track for participant:', participant.id);
            track.enabled = true;
          }
        });

        // Start playback immediately
        // Use try-catch for better cross-browser compatibility
        try {
          playPromiseRef.current = videoElement.play();
          await playPromiseRef.current;
          playPromiseRef.current = null;
          console.log('▶️ Started playback for participant:', participant.id);
        } catch (playErr) {
          const error = playErr as Error;
          // Handle common browser autoplay restrictions
          if (error.name === 'NotAllowedError') {
            console.warn('⚠️ Autoplay blocked by browser - user interaction may be required');
          } else if (error.name !== 'AbortError') {
            console.error('▶️ Play error:', error);
          }
          playPromiseRef.current = null;
        }
      } catch (err) {
        const error = err as Error;
        if (error.name !== 'AbortError') {
          console.error('▶️ Setup error:', err);
        }
        playPromiseRef.current = null;
      }
    };

    setupStream();

    return () => {
      playPromiseRef.current = null;
    };
  }, [participant.stream, participant.id]);

  // Handle audio output device separately - don't block playback
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !selectedAudioOutput) return;

    const setAudioOutput = async () => {
      // Wait for video element to be ready
      if (videoElement.readyState < 1) {
        await new Promise<void>((resolve) => {
          const onLoadedMetadata = () => {
            videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
            resolve();
          };
          videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
          
          // Timeout fallback for slower connections
          setTimeout(() => {
            videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
            resolve();
          }, 5000);
        });
      }

      // Set audio output device (only supported in Chromium browsers)
      if (typeof videoElement.setSinkId === 'function') {
        try {
          await videoElement.setSinkId(selectedAudioOutput);
          console.log('🔊 Audio output set for participant:', participant.id);
        } catch (err) {
          const error = err as Error;
          if (error.name !== 'AbortError' && error.name !== 'NotFoundError') {
            console.warn('⚠️ Could not set audio output device:', error.message);
            // Fallback: just use default audio output (Firefox, Safari)
          }
        }
      } else {
        // Browser doesn't support setSinkId (Firefox, Safari)
        console.log('ℹ️ Audio output selection not supported in this browser');
      }
    };

    setAudioOutput();
  }, [selectedAudioOutput, participant.id]);

  const hasVideo = participant.stream.getVideoTracks().length > 0;
  const audioTrack = participant.stream.getAudioTracks()[0];
  const videoTrack = participant.stream.getVideoTracks()[0];
  const isAudioEnabled = audioTrack?.enabled ?? false;
  const isVideoEnabled = videoTrack?.enabled ?? false;

  return (
    <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        controls={false}
        disablePictureInPicture
        className="w-full h-full object-cover"
        style={{ WebkitTransform: 'translateZ(0)' }} // Hardware acceleration hint
      />
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded-full text-sm flex items-center gap-2">
        <span>Participant {participant.id.substring(0, 8)}</span>
        {!isVideoEnabled && <span className="text-red-400">📷</span>}
        {!isAudioEnabled && <span className="text-red-400">🔇</span>}
      </div>
      {(!hasVideo || !isVideoEnabled) && (
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
      )}
    </div>
  );
}
