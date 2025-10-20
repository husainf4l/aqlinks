# WebRTC Voice Agent - STT-LLM-TTS Pipeline

A voice AI agent that connects to your WebRTC SFU server and participates in voice conversations using Speech-to-Text, Large Language Models, and Text-to-Speech.

## 🎯 Architecture

Inspired by LiveKit Agents, this implementation includes:

- **WebRTC Integration**: Connects to your SFU server as a participant
- **STT (Speech-to-Text)**: Uses Faster Whisper for real-time transcription
- **LLM (Language Model)**: OpenAI GPT for intelligent responses
- **TTS (Text-to-Speech)**: OpenAI TTS for natural voice synthesis
- **VAD (Voice Activity Detection)**: Energy-based speech detection

## 🚀 Quick Start

### 1. Setup Environment

```bash
cd agent
./setup.sh
```

This will:
- Create a Python virtual environment
- Install all required dependencies
- Set up the project

### 2. Configure API Keys

The `.env` file already contains your OpenAI API key. Verify it:

```bash
cat .env
```

You should see:
- `OPENAI_API_KEY` - Your OpenAI API key ✅
- `SFU_URL` - SFU server WebSocket URL (default: ws://localhost:8080/ws)
- `ROOM_NAME` - Room to join (default: test)

### 3. Test Connection

First, make sure your SFU server is running (PM2 ID: 18).

Then test the connection:

```bash
source venv/bin/activate
python test_connection.py
```

This will:
- Initialize the AI components
- Connect to the SFU server
- Stay connected for 10 seconds
- Report success/failure

### 4. Run the Agent

```bash
python voice_agent.py
```

The agent will:
1. ✅ Connect to room "test"
2. 🎤 Listen to participant audio
3. 📝 Transcribe speech using Whisper
4. 🤖 Generate responses using GPT-4
5. 🔊 Synthesize and send audio back

## 📋 Usage Example

```bash
# Terminal 1: Make sure SFU server is running
pm2 logs 18

# Terminal 2: Run the voice agent
cd agent
source venv/bin/activate
python voice_agent.py

# Terminal 3: Open the web app
cd ..
npm run dev

# Now join the "test" room in your browser
# The agent will listen and respond to your voice!
```

## Configuration Options

### STT Models

You can configure the Whisper model size in `AgentConfig`:
- `tiny`: Fastest, least accurate
- `base`: Good balance (default)
- `small`: Better accuracy
- `medium`: High accuracy
- `large`: Best accuracy, slowest

### LLM Models

Supported OpenAI models:
- `gpt-4`: Best quality
- `gpt-4-turbo`: Faster, cost-effective
- `gpt-3.5-turbo`: Fastest, lowest cost

### TTS Voices

**OpenAI TTS voices:**
- `alloy`: Neutral
- `echo`: Male
- `fable`: British accent
- `onyx`: Deep male
- `nova`: Female
- `shimmer`: Soft female

**ElevenLabs:** Configure custom voices in the code

## Architecture Details

### Pipeline Flow

```
User Speech → WebRTC → Audio Buffer → VAD
                                        ↓
                                  Speech Detection
                                        ↓
                                   STT (Whisper)
                                        ↓
                                   Transcript
                                        ↓
                                   LLM (GPT-4)
                                        ↓
                                  Response Text
                                        ↓
                                  TTS (ElevenLabs)
                                        ↓
                                   Audio Stream → WebRTC → Room
```

### Components

- **VoiceAgent**: Main agent class managing the lifecycle
- **AgentSession**: Handles WebRTC connection and signaling
- **STT Pipeline**: Processes audio chunks through Whisper
- **LLM Pipeline**: Generates conversational responses
- **TTS Pipeline**: Synthesizes natural speech
- **VAD**: Detects speech activity and silence

## Comparison with LiveKit Agents

This implementation follows LiveKit Agents design patterns:

| Feature | LiveKit Agents | This Implementation |
|---------|---------------|-------------------|
| STT | Multiple plugins | Faster Whisper |
| LLM | Multiple providers | OpenAI |
| TTS | Multiple providers | ElevenLabs/OpenAI |
| WebRTC | LiveKit SDK | aiortc |
| Signaling | LiveKit protocol | Custom WebSocket |
| VAD | Silero VAD | Simple energy-based |

## Next Steps

### TODO

- [x] Basic WebRTC connection
- [ ] Complete WebSocket signaling implementation
- [ ] Audio track publishing
- [ ] Advanced VAD (Silero VAD integration)
- [ ] Streaming TTS output
- [ ] Multi-participant handling
- [ ] Context management for conversations
- [ ] Function calling/tools support
- [ ] Metrics and monitoring

### Improvements

1. **Better VAD**: Integrate Silero VAD for more accurate speech detection
2. **Streaming**: Implement streaming TTS for lower latency
3. **Context**: Add conversation history management
4. **Tools**: Add function calling capabilities
5. **Monitoring**: Add metrics and health checks

## Troubleshooting

### Audio Quality Issues
- Adjust `sample_rate` and `channels` in `AgentConfig`
- Try different Whisper models (larger = better quality)

### High Latency
- Use smaller Whisper model (`tiny` or `base`)
- Enable GPU acceleration for Whisper
- Use streaming TTS

### Connection Issues
- Verify SFU server is running
- Check WebSocket URL configuration
- Review server logs for errors

## License

Same as parent project
