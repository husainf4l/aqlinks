import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseMediaDevicesReturn {
  localStream: MediaStream | null;
  isMediaStarted: boolean;
  isStartingMedia: boolean;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  audioOutputDevices: MediaDeviceInfo[];
  selectedAudioOutput: string;
  startMedia: () => Promise<MediaStream>;
  stopMedia: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setSelectedAudioOutput: (deviceId: string) => void;
}

export function useMediaDevices(): UseMediaDevicesReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMediaStarted, setIsMediaStarted] = useState(false);
  const [isStartingMedia, setIsStartingMedia] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>('');
  
  const localStreamRef = useRef<MediaStream | null>(null);

  // Get available audio output devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audiooutput');
        setAudioOutputDevices(audioDevices);
        if (audioDevices.length > 0 && !selectedAudioOutput) {
          setSelectedAudioOutput(audioDevices[0].deviceId);
        }
      } catch (err) {
        console.error('Error enumerating devices:', err);
      }
    };

    getDevices();

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    };
  }, [selectedAudioOutput]);

  const startMedia = useCallback(async (): Promise<MediaStream> => {
    if (isMediaStarted && localStreamRef.current) {
      return localStreamRef.current;
    }
    console.log('=== START MEDIA ===');
    setIsStartingMedia(true);
    
    try {
      // Check for media device support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Media devices not supported. This may be due to accessing the page over HTTP instead of HTTPS, or browser limitations.');
      }
      
      // Detect browser and platform for optimal settings
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      console.log('📱 Platform detection:', { isIOS, isSafari, isFirefox, isMobile });
      
      let stream: MediaStream | null = null;
      let hasVideo = false;
      let hasAudio = false;
      
      try {
        console.log('📹 Requesting camera and microphone access...');
        
        // Optimize constraints for platform
        const videoConstraints = isMobile ? {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 }
        } : {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        };
        
        // Safari/iOS may need simpler audio constraints
        // Use VERY simple constraints for maximum compatibility
        const audioConstraints = isMobile ? true : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 1 }  // Changed to mono for better compatibility
        };
        
        const constraints = {
          video: videoConstraints,
          audio: audioConstraints
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        hasVideo = stream.getVideoTracks().length > 0;
        hasAudio = stream.getAudioTracks().length > 0;
        console.log(`✅ Got media - Video: ${hasVideo}, Audio: ${hasAudio}`);
      } catch (videoError) {
        console.warn('⚠️ Failed to get video+audio, trying alternatives:', videoError);
        const error = videoError as Error;
        if (error.name === 'NotAllowedError') {
          console.warn('🚫 Permission denied');
        }
        try {
          console.log('🎤 Trying audio only...');
          // Use simpler audio constraints for fallback
          const audioConstraints = {
            video: false,
            audio: (isSafari || isIOS) ? true : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          };
          stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
          hasAudio = stream.getAudioTracks().length > 0;
          console.log(`✅ Got audio only - Audio: ${hasAudio}`);
          setIsVideoOff(true);
        } catch (audioError) {
          console.warn('⚠️ Audio failed, trying video only:', audioError);
          try {
            console.log('📹 Trying video only...');
            // Use simpler video constraints for fallback
            const videoOnlyConstraints = isMobile ? {
              video: { facingMode: 'user' },
              audio: false
            } : {
              video: {
                width: { ideal: 640 },
                height: { ideal: 480 }
              }, 
              audio: false 
            };
            stream = await navigator.mediaDevices.getUserMedia(videoOnlyConstraints);
            hasVideo = stream.getVideoTracks().length > 0;
            console.log(`✅ Got video only - Video: ${hasVideo}`);
            setIsAudioMuted(true);
          } catch {
            throw new Error('Could not access any media devices (camera or microphone)');
          }
        }
      }
      
      if (!stream) {
        throw new Error('Could not access any media devices');
      }
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      console.log('✅ Media access granted');
      console.log('Stream details:', {
        audioTracks: stream.getAudioTracks().map(t => ({ 
          id: t.id, 
          label: t.label, 
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          settings: t.getSettings()
        })),
        videoTracks: stream.getVideoTracks().map(t => ({ 
          id: t.id, 
          label: t.label, 
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState
        }))
      });
      
      setIsMediaStarted(true);
      
      if (!hasVideo) {
        setIsVideoOff(true);
      }
      if (!hasAudio) {
        setIsAudioMuted(true);
      }
      
      // Return the stream so caller can verify it immediately
      return stream;
    } catch (err) {
      console.error('❌ Failed to start media:', err);
      throw err;
    } finally {
      setIsStartingMedia(false);
    }
  }, [isMediaStarted]);

  const stopMedia = useCallback(() => {
    if (localStreamRef.current) {
      console.log('🛑 Stopping local media tracks');
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`  Stopping ${track.kind} track:`, track.id);
        track.stop();
      });
      localStreamRef.current = null;
      setLocalStream(null);
    }
    
    setIsMediaStarted(false);
    setIsAudioMuted(false);
    setIsVideoOff(false);
  }, []);

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
        console.log('🎤 Audio toggled:', audioTrack.enabled ? 'ON' : 'OFF');
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        console.log('📹 Video toggled:', videoTrack.enabled ? 'ON' : 'OFF');
      }
    }
  }, []);

  return {
    localStream,
    isMediaStarted,
    isStartingMedia,
    isAudioMuted,
    isVideoOff,
    audioOutputDevices,
    selectedAudioOutput,
    startMedia,
    stopMedia,
    toggleAudio,
    toggleVideo,
    setSelectedAudioOutput,
  };
}
