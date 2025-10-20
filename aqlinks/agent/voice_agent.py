#!/usr/bin/env python3
"""
WebRTC Voice Agent with STT-LLM-TTS Pipeline
===========================================

Architecture similar to LiveKit Agents but customized for our SFU setup:
- Connects to WebRTC room via WebSocket signaling
- Receives audio from participants
- Processes through STT → LLM → TTS pipeline
- Sends audio responses back to the room

Based on LiveKit Agents design patterns:
- AgentSession manages the lifecycle
- Pipeline handles STT → LLM → TTS flow
- WebRTC handles media transport
"""

import asyncio
import json
import logging
import os
import sys
import uuid
import wave
import io
import fractions
from dataclasses import dataclass, field
from typing import Optional, Callable, List
from enum import Enum

from dotenv import load_dotenv
import websockets
from aiortc import (
    RTCPeerConnection, 
    RTCSessionDescription, 
    RTCIceCandidate, 
    MediaStreamTrack,
    RTCConfiguration,
    RTCIceServer
)
from aiortc.contrib.media import MediaBlackhole, MediaPlayer
from av import AudioFrame
import numpy as np

# Import AI services
from faster_whisper import WhisperModel
from openai import AsyncOpenAI

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("voice-agent")

# Suppress noisy aiortc warnings
logging.getLogger("aiortc.codecs.vpx").setLevel(logging.ERROR)
logging.getLogger("aiortc").setLevel(logging.WARNING)


class AgentState(Enum):
    """Agent connection states"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    PROCESSING = "processing"
    SPEAKING = "speaking"


class AudioStreamTrack(MediaStreamTrack):
    """
    Custom audio track for sending TTS audio to the room
    """
    kind = "audio"
    
    def __init__(self, sample_rate: int = 24000, channels: int = 1):
        super().__init__()
        self.sample_rate = sample_rate
        self.channels = channels
        self._queue = asyncio.Queue()
        self._timestamp = 0
        self._samples_per_frame = int(sample_rate * 0.02)  # 20ms frames
        
    async def recv(self):
        """Receive next audio frame"""
        # Get audio data from queue or send silence
        try:
            audio_data = await asyncio.wait_for(self._queue.get(), timeout=0.02)
        except asyncio.TimeoutError:
            # Send silence if no audio available
            audio_data = np.zeros(self._samples_per_frame, dtype=np.int16)
        
        # Create audio frame
        frame = AudioFrame.from_ndarray(
            audio_data.reshape(1, -1),
            format='s16',
            layout='mono'
        )
        frame.sample_rate = self.sample_rate
        frame.pts = self._timestamp
        frame.time_base = fractions.Fraction(1, self.sample_rate)
        
        self._timestamp += self._samples_per_frame
        return frame
    
    async def send_audio(self, audio_data: np.ndarray):
        """Send audio data to the track"""
        await self._queue.put(audio_data)


@dataclass
class AgentConfig:
    """Agent configuration."""
    sfu_url: str = "ws://localhost:8080/ws"
    room_name: str = "test"
    user_id: str = field(default_factory=lambda: f"agent-{uuid.uuid4()}")
    
    # STT Configuration
    stt_model: str = "base"  # Whisper model size
    
    # LLM Configuration
    llm_model: str = "gpt-4"
    llm_instructions: str = "You are a helpful AI assistant in a voice conversation. Keep your responses concise and natural."
    
    # TTS Configuration
    tts_voice: str = "alloy"  # OpenAI TTS voice
    
    # Audio Configuration
    sample_rate: int = 48000
    channels: int = 1
    
    # VAD Configuration
    vad_threshold: float = 0.00000001  # Extremely sensitive threshold to detect even quiet audio
    silence_duration: float = 1.5  # Seconds of silence before processing speech


class VoiceAgent:
    """
    Main Voice Agent class that handles the STT-LLM-TTS pipeline
    Inspired by LiveKit's AgentSession architecture
    """
    
    def __init__(self, config: AgentConfig):
        self.config = config
        self.state = AgentState.DISCONNECTED
        
        # WebRTC/WebSocket
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.pc: Optional[RTCPeerConnection] = None
        self.audio_track: Optional[AudioStreamTrack] = None
        
        # AI Components
        self.stt: Optional[WhisperModel] = None
        self.llm: Optional[AsyncOpenAI] = None
        
        # Audio buffers
        self.audio_buffer: List[np.ndarray] = []
        self.speech_buffer: List[np.ndarray] = []
        self.is_speaking = False
        self.last_speech_time = 0
        
        # Conversation context
        self.conversation_history = []
        
        # Callbacks
        self.on_state_change: Optional[Callable] = None
        self.on_transcript: Optional[Callable] = None
        self.on_response: Optional[Callable] = None
        
        logger.info(f"🤖 Voice Agent initialized with ID: {config.user_id}")
    
    async def initialize(self):
        """Initialize AI components"""
        logger.info("🔧 Initializing AI components...")
        
        # Initialize STT (Faster Whisper)
        logger.info(f"Loading Whisper model: {self.config.stt_model}")
        self.stt = WhisperModel(
            self.config.stt_model,
            device="cpu",  # Use "cuda" if GPU available
            compute_type="int8"
        )
        
        # Initialize LLM (OpenAI)
        logger.info("Initializing OpenAI LLM")
        self.llm = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        logger.info("✅ AI components initialized")
    
    async def connect(self):
        """Connect to the SFU server and join the room"""
        self._set_state(AgentState.CONNECTING)
        logger.info(f"🔗 Connecting to room: {self.config.room_name}")
        
        # Build WebSocket URL
        ws_url = f"{self.config.sfu_url}?room={self.config.room_name}&userId={self.config.user_id}"
        
        # Create WebRTC peer connection
        ice_servers = [
            RTCIceServer(urls=["stun:stun.l.google.com:19302"]),
            RTCIceServer(urls=["stun:stun1.l.google.com:19302"])
        ]
        config = RTCConfiguration(iceServers=ice_servers)
        self.pc = RTCPeerConnection(configuration=config)
        
        # Create audio track for sending our TTS audio
        self.audio_track = AudioStreamTrack(
            sample_rate=self.config.sample_rate,
            channels=self.config.channels
        )
        
        # Add our audio track to peer connection
        self.pc.addTrack(self.audio_track)
        logger.info("🎤 Added agent audio track")
        
        # Set up WebRTC handlers
        self._setup_peer_connection_handlers()
        
        # Connect via WebSocket
        await self._connect_websocket(ws_url)
        
        logger.info("✅ Connected to room")
        self._set_state(AgentState.CONNECTED)
    
    def _setup_peer_connection_handlers(self):
        """Set up WebRTC peer connection event handlers"""
        
        @self.pc.on("track")
        def on_track(track):
            logger.info(f"🎬 Received {track.kind} track from participant")
            
            if track.kind == "audio":
                # Process incoming audio
                asyncio.create_task(self._process_audio_track(track))
            elif track.kind == "video":
                # Ignore video tracks, just consume them to prevent errors
                logger.info("📹 Video track received (ignoring)")
                asyncio.create_task(self._consume_video_track(track))
        
        @self.pc.on("icecandidate")
        def on_ice_candidate(candidate):
            if candidate:
                logger.info(f"🧊 New ICE candidate: {candidate.candidate[:50]}...")
                # Send ICE candidate to server
                asyncio.create_task(self._send_message({
                    "type": "candidate",
                    "data": {
                        "candidate": candidate.candidate,
                        "sdpMid": candidate.sdpMid,
                        "sdpMLineIndex": candidate.sdpMLineIndex
                    }
                }))
        
        @self.pc.on("iceconnectionstatechange")
        async def on_ice_state_change():
            logger.info(f"🧊 ICE Connection State: {self.pc.iceConnectionState}")
            if self.pc.iceConnectionState == "failed":
                logger.error("❌ ICE connection failed")
                await self.disconnect()
        
        @self.pc.on("connectionstatechange")
        async def on_connection_state_change():
            logger.info(f"🔗 Connection State: {self.pc.connectionState}")
            if self.pc.connectionState == "failed":
                logger.error("❌ Peer connection failed")
                await self.disconnect()
    
    async def _connect_websocket(self, ws_url: str):
        """Connect to WebSocket and handle signaling"""
        logger.info(f"📡 Connecting to WebSocket: {ws_url}")
        
        try:
            self.ws = await websockets.connect(ws_url)
            logger.info("✅ WebSocket connected")
            
            # Start message handling loop
            asyncio.create_task(self._handle_websocket_messages())
            
        except Exception as e:
            logger.error(f"❌ WebSocket connection failed: {e}")
            raise
    
    async def _handle_websocket_messages(self):
        """Handle incoming WebSocket messages"""
        try:
            async for message in self.ws:
                data = json.loads(message)
                await self._handle_signaling_message(data)
        except websockets.exceptions.ConnectionClosed:
            logger.warning("⚠️ WebSocket connection closed")
            await self.disconnect()
        except Exception as e:
            logger.error(f"❌ WebSocket error: {e}")
            await self.disconnect()
    
    async def _handle_signaling_message(self, msg: dict):
        """Handle signaling messages from server"""
        msg_type = msg.get("type")
        logger.info(f"📨 Received message: {msg_type}")
        
        if msg_type == "offer":
            # Server sent us an offer
            await self._handle_offer(msg["data"])
        
        elif msg_type == "answer":
            # Server sent us an answer (after we sent offer)
            await self._handle_answer(msg["data"])
        
        elif msg_type == "candidate":
            # ICE candidate from server
            await self._handle_ice_candidate(msg["data"])
        
        elif msg_type == "client-left":
            # Another participant left
            client_id = msg["data"].get("clientId")
            logger.info(f"👋 Client left: {client_id}")
    
    async def _handle_offer(self, offer_data: dict):
        """Handle SDP offer from server"""
        logger.info("� Received offer from server")
        
        # Set remote description
        await self.pc.setRemoteDescription(
            RTCSessionDescription(
                sdp=offer_data["sdp"],
                type=offer_data["type"]
            )
        )
        logger.info("✅ Remote description (offer) set")
        
        # Create answer
        answer = await self.pc.createAnswer()
        await self.pc.setLocalDescription(answer)
        logger.info("📝 Created answer")
        
        # Send answer to server
        await self._send_message({
            "type": "answer",
            "data": {
                "sdp": self.pc.localDescription.sdp,
                "type": self.pc.localDescription.type
            }
        })
        logger.info("📤 Sent answer to server")
    
    async def _handle_answer(self, answer_data: dict):
        """Handle SDP answer from server"""
        logger.info("📥 Received answer from server")
        
        await self.pc.setRemoteDescription(
            RTCSessionDescription(
                sdp=answer_data["sdp"],
                type=answer_data["type"]
            )
        )
        logger.info("✅ Remote description (answer) set")
    
    async def _handle_ice_candidate(self, candidate_data: dict):
        """Handle ICE candidate from server"""
        try:
            # RTCIceCandidate constructor expects different parameters
            candidate = RTCIceCandidate(
                sdpMid=candidate_data.get("sdpMid"),
                sdpMLineIndex=candidate_data.get("sdpMLineIndex"),
                candidate=candidate_data.get("candidate")
            )
            await self.pc.addIceCandidate(candidate)
            logger.info("✅ Added ICE candidate")
        except Exception as e:
            logger.debug(f"⚠️ ICE candidate error (can be ignored): {e}")
    
    async def _send_message(self, msg: dict):
        """Send message to server via WebSocket"""
        try:
            if self.ws and hasattr(self.ws, 'open') and self.ws.open:
                await self.ws.send(json.dumps(msg))
            elif self.ws:
                await self.ws.send(json.dumps(msg))
        except Exception as e:
            logger.warning(f"⚠️ Cannot send message: {e}")
    
    async def _process_audio_track(self, track: MediaStreamTrack):
        """Process incoming audio track through STT"""
        logger.info("🎤 Starting audio processing")
        
        frame_count = 0
        try:
            while True:
                # Receive audio frame
                frame = await track.recv()
                frame_count += 1
                
                # Log every 100 frames
                if frame_count % 100 == 0:
                    logger.info(f"📊 Processed {frame_count} audio frames")
                
                # Convert to numpy array (mono, 16-bit PCM)
                try:
                    audio_data = frame.to_ndarray()
                    
                    # Log raw audio info every 100 frames
                    if frame_count % 100 == 0:
                        logger.info(f"🔍 RAW audio - dtype: {audio_data.dtype}, shape: {audio_data.shape}, "
                                   f"min: {audio_data.min()}, max: {audio_data.max()}, "
                                   f"mean: {np.abs(audio_data).mean():.6f}")
                    
                    # Handle different shapes
                    if len(audio_data.shape) > 1:
                        # Multi-dimensional, convert to 1D
                        if audio_data.shape[0] > 1:
                            # Multiple channels, convert to mono
                            audio_data = audio_data.mean(axis=0)
                        else:
                            # Single channel, flatten
                            audio_data = audio_data.flatten()
                    
                    # Normalize based on dtype
                    if audio_data.dtype == np.int16:
                        # Convert int16 to float32 in range [-1, 1]
                        audio_data = audio_data.astype(np.float32) / 32768.0
                        if frame_count % 100 == 0:
                            logger.info(f"🔄 Normalized int16 by /32768.0")
                    elif audio_data.dtype != np.float32:
                        # Convert to float32
                        audio_data = audio_data.astype(np.float32)
                        # Check if values are outside [-1, 1] range (need normalization)
                        if audio_data.max() > 1.0 or audio_data.min() < -1.0:
                            audio_data = audio_data / 32768.0
                            if frame_count % 100 == 0:
                                logger.info(f"🔄 Normalized float by /32768.0")
                    
                    # APPLY GAIN BOOST - Amplify quiet audio by 3x (reduced from 10x)
                    audio_data = audio_data * 3.0
                    if frame_count % 100 == 0:
                        logger.info(f"🔊 Applied 3x gain boost")
                    
                    # Clip to prevent distortion
                    audio_data = np.clip(audio_data, -1.0, 1.0)
                    
                    # Log after normalization and gain
                    if frame_count % 100 == 0:
                        logger.info(f"📊 AFTER gain - min: {audio_data.min():.6f}, "
                                   f"max: {audio_data.max():.6f}, mean: {np.abs(audio_data).mean():.6f}")
                    
                    # Resample if needed (Whisper expects 16kHz)
                    if frame.sample_rate != 16000:
                        # Simple resampling (for production, use librosa)
                        audio_data = self._resample_audio(audio_data, frame.sample_rate, 16000)
                    
                    # Convert to int16 for storage
                    audio_int16 = (audio_data * 32767).astype(np.int16)
                    
                    # Add to buffer
                    self.audio_buffer.append(audio_int16)
                    
                    # Check for speech activity
                    current_time = asyncio.get_event_loop().time()
                    
                    # Skip speech detection when agent is speaking (to avoid hearing ourselves)
                    if self.state == AgentState.SPEAKING:
                        continue
                    
                    if self._detect_speech(audio_data):
                        self.last_speech_time = current_time
                        if not self.is_speaking:
                            energy = np.sqrt(np.mean(audio_data ** 2))
                            logger.info(f"🗣️ Speech detected (energy: {energy:.4f}), starting collection")
                            self.is_speaking = True
                            self.speech_buffer = []
                        self.speech_buffer.append(audio_int16)
                        
                        # Log buffer size periodically
                        if len(self.speech_buffer) % 50 == 0:
                            logger.info(f"📝 Speech buffer: {len(self.speech_buffer)} frames")
                    
                    # Check if speech ended (silence after speech)
                    elif self.is_speaking:
                        silence_duration = current_time - self.last_speech_time
                        if silence_duration >= self.config.silence_duration:
                            logger.info(f"🤫 Silence detected ({silence_duration:.2f}s), processing speech ({len(self.speech_buffer)} frames)")
                            self.is_speaking = False
                            # Process the collected speech
                            asyncio.create_task(self._process_speech())
                            self.audio_buffer = []
                
                except Exception as audio_error:
                    logger.debug(f"⚠️ Audio frame processing skipped: {audio_error}")
                    continue
                
        except Exception as e:
            if "track ended" not in str(e).lower():
                logger.error(f"❌ Error processing audio: {e}")
    
    async def _consume_video_track(self, track: MediaStreamTrack):
        """Consume video track to prevent decoder errors (we don't process video)"""
        try:
            while True:
                # Just receive and discard frames
                await track.recv()
        except Exception:
            # Track ended, that's fine
            pass
    
    def _resample_audio(self, audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
        """Simple audio resampling"""
        if orig_sr == target_sr:
            return audio
        
        # Calculate resampling ratio
        ratio = target_sr / orig_sr
        new_length = int(len(audio) * ratio)
        
        # Simple linear interpolation
        indices = np.linspace(0, len(audio) - 1, new_length)
        return np.interp(indices, np.arange(len(audio)), audio)
    
    def _detect_speech(self, audio_data: np.ndarray) -> bool:
        """Simple VAD based on audio energy"""
        if len(audio_data) == 0:
            return False
        
        # Calculate RMS energy
        energy = np.sqrt(np.mean(audio_data ** 2))
        
        # Use a higher threshold to avoid false positives
        # With 10x gain boost, normal speech should be 0.05-1.0 range
        # Background noise is typically < 0.03
        speech_threshold = 0.05  # Raised to reduce sensitivity
        
        is_speech = energy > speech_threshold
        
        # Only log on state changes
        if hasattr(self, '_last_speech_state'):
            if self._last_speech_state != is_speech:
                logger.info(f"🎚️ Speech state changed: {'SPEECH START ✅' if is_speech else 'SILENCE 🤫'} (energy: {energy:.6f})")
        
        self._last_speech_state = is_speech
        return is_speech
    
    async def _process_speech(self):
        """Process speech through STT → LLM → TTS pipeline"""
        if not self.speech_buffer:
            logger.warning("⚠️ Empty speech buffer, skipping processing")
            return
        
        self._set_state(AgentState.PROCESSING)
        logger.info(f"🎙️ Processing speech utterance ({len(self.speech_buffer)} frames)")
        
        try:
            # Step 1: Speech-to-Text
            audio_array = np.concatenate(self.speech_buffer)
            logger.info(f"🎯 Audio array shape: {audio_array.shape}, dtype: {audio_array.dtype}")
            logger.info("🎤 Starting Whisper transcription...")
            transcript = await self._transcribe_audio(audio_array)
            logger.info(f"📝 Transcript (length {len(transcript)}): '{transcript}'")
            
            if self.on_transcript:
                self.on_transcript(transcript)
            
            if not transcript.strip():
                logger.info("⚠️ Empty transcript after STT, skipping LLM")
                self._set_state(AgentState.CONNECTED)
                return
            
            # Step 2: LLM Processing
            logger.info("🧠 Calling OpenAI LLM...")
            response_text = await self._get_llm_response(transcript)
            logger.info(f"💬 LLM Response (length {len(response_text)}): '{response_text}'")
            
            if self.on_response:
                self.on_response(response_text)
            
            # Step 3: Text-to-Speech and send
            logger.info("🔊 Starting TTS synthesis...")
            await self._synthesize_and_send(response_text)
            logger.info("✅ Speech processing pipeline complete!")
            
        except Exception as e:
            logger.error(f"❌ Error in speech processing pipeline: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self._set_state(AgentState.CONNECTED)
    
    async def _transcribe_audio(self, audio_data: np.ndarray) -> str:
        """Transcribe audio using Whisper"""
        try:
            # Normalize audio to float32 in range [-1, 1]
            audio_float = audio_data.astype(np.float32) / 32767.0
            logger.info(f"🎵 Audio prepared for Whisper: {len(audio_float)} samples, range [{audio_float.min():.3f}, {audio_float.max():.3f}]")
            
            # Transcribe (run in thread pool to avoid blocking)
            loop = asyncio.get_event_loop()
            logger.info("⏳ Calling Whisper model (this may take a few seconds)...")
            segments, info = await loop.run_in_executor(
                None,
                self.stt.transcribe,
                audio_float
            )
            logger.info(f"✅ Whisper completed. Detected language: {info.language if hasattr(info, 'language') else 'unknown'}")
            
            # Collect all segments with detailed logging
            transcript_parts = []
            segment_count = 0
            for segment in segments:
                segment_count += 1
                logger.info(f"📝 Segment {segment_count}: '{segment.text}' [start={segment.start:.2f}s, end={segment.end:.2f}s, prob={segment.avg_logprob:.2f}]")
                transcript_parts.append(segment.text)
            
            transcript = " ".join(transcript_parts).strip()
            logger.info(f"📝 Full transcript: '{transcript}' ({len(transcript_parts)} segments)")
            return transcript
            
        except Exception as e:
            logger.error(f"❌ Transcription error: {e}")
            return ""
    
    async def _get_llm_response(self, text: str) -> str:
        """Get response from LLM"""
        try:
            # Add to conversation history
            self.conversation_history.append({
                "role": "user",
                "content": text
            })
            
            # Keep conversation history reasonable (last 10 messages)
            if len(self.conversation_history) > 10:
                self.conversation_history = self.conversation_history[-10:]
            
            # Prepare messages
            messages = [
                {"role": "system", "content": self.config.llm_instructions}
            ] + self.conversation_history
            
            logger.info(f"📤 Sending to LLM: {len(messages)} messages, latest: '{text}'")
            
            # Get LLM response
            response = await self.llm.chat.completions.create(
                model=self.config.llm_model,
                messages=messages,
                max_tokens=150,
                temperature=0.7
            )
            
            logger.info(f"📥 LLM response received: {response.choices[0].finish_reason}")
            
            response_text = response.choices[0].message.content
            
            # Add to conversation history
            self.conversation_history.append({
                "role": "assistant",
                "content": response_text
            })
            
            return response_text
            
        except Exception as e:
            logger.error(f"❌ LLM error: {e}")
            return "I apologize, but I encountered an error processing your request."
    
    async def _synthesize_and_send(self, text: str):
        """Synthesize speech and send to room"""
        self._set_state(AgentState.SPEAKING)
        logger.info(f"🔊 Synthesizing speech: '{text[:100]}...'")
        
        try:
            # Use OpenAI TTS
            logger.info("⏳ Calling OpenAI TTS API...")
            response = await self.llm.audio.speech.create(
                model="tts-1",
                voice=self.config.tts_voice,
                input=text,
                response_format="pcm"  # Raw PCM data
            )
            
            # Get audio data
            audio_bytes = response.content
            logger.info(f"✅ TTS audio received: {len(audio_bytes)} bytes")
            
            # Convert to numpy array (16-bit PCM)
            audio_data = np.frombuffer(audio_bytes, dtype=np.int16)
            logger.info(f"🎵 Audio data: {len(audio_data)} samples")
            
            # Resample if needed (from 24kHz to our sample rate)
            if self.config.sample_rate != 24000:
                logger.info(f"🔄 Resampling from 24000Hz to {self.config.sample_rate}Hz")
                audio_data = self._resample_audio(audio_data, 24000, self.config.sample_rate)
            
            # Ensure audio is int16
            audio_data = audio_data.astype(np.int16)
            
            # Send in chunks (20ms at a time)
            chunk_size = int(self.config.sample_rate * 0.02)  # 20ms
            logger.info(f"📡 Sending audio in {len(audio_data) // chunk_size} chunks of {chunk_size} samples")
            for i in range(0, len(audio_data), chunk_size):
                chunk = audio_data[i:i+chunk_size]
                if len(chunk) < chunk_size:
                    # Pad last chunk
                    chunk = np.pad(chunk, (0, chunk_size - len(chunk)))
                
                await self.audio_track.send_audio(chunk)
                await asyncio.sleep(0.02)  # 20ms delay
            
            logger.info("✅ Finished speaking")
                
        except Exception as e:
            logger.error(f"❌ Error in TTS: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self._set_state(AgentState.CONNECTED)
    
    def _set_state(self, state: AgentState):
        """Update agent state and trigger callback"""
        if self.state != state:
            logger.info(f"📊 State change: {self.state.value} → {state.value}")
            self.state = state
            if self.on_state_change:
                self.on_state_change(state)
    
    async def disconnect(self):
        """Disconnect from the room"""
        logger.info("👋 Disconnecting from room")
        
        if self.pc:
            await self.pc.close()
        
        if self.ws:
            await self.ws.close()
        
        self._set_state(AgentState.DISCONNECTED)
        logger.info("✅ Disconnected")


async def main():
    """Main entry point for the voice agent"""
    # Configuration
    config = AgentConfig(
        sfu_url=os.getenv("SFU_URL", "ws://localhost:8080/ws"),
        room_name=os.getenv("ROOM_NAME", "test"),
        llm_model=os.getenv("LLM_MODEL", "gpt-4"),
        llm_instructions=os.getenv("LLM_INSTRUCTIONS", 
            "You are a helpful AI assistant in a voice conversation. "
            "Keep your responses concise and natural."
        )
    )
    
    # Create and initialize agent
    agent = VoiceAgent(config)
    
    # Set up callbacks
    def on_state_change(state: AgentState):
        logger.info(f"🔔 Agent state changed to: {state.value}")
    
    def on_transcript(text: str):
        logger.info(f"🎯 User said: {text}")
    
    def on_response(text: str):
        logger.info(f"🤖 Agent responding: {text}")
    
    agent.on_state_change = on_state_change
    agent.on_transcript = on_transcript
    agent.on_response = on_response
    
    try:
        # Initialize AI components
        await agent.initialize()
        
        # Connect to room
        await agent.connect()
        
        # Keep running
        logger.info("🚀 Agent is running. Press Ctrl+C to stop.")
        while True:
            await asyncio.sleep(1)
            
    except KeyboardInterrupt:
        logger.info("⚠️ Received shutdown signal")
    finally:
        await agent.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
