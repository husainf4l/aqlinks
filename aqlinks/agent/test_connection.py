#!/usr/bin/env python3
"""
Simple test script to verify the voice agent can connect to the SFU server
"""

import asyncio
import logging
import os
from dotenv import load_dotenv
from voice_agent import VoiceAgent, AgentConfig, AgentState

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("test")


async def test_connection():
    """Test basic connection to SFU server"""
    logger.info("🧪 Starting connection test...")
    
    # Simple configuration
    config = AgentConfig(
        sfu_url="ws://localhost:8080/ws",
        room_name="test",
        user_id="test-agent",
        llm_model="gpt-4o-mini",
        stt_model="tiny"  # Use smallest model for faster loading
    )
    
    agent = VoiceAgent(config)
    
    # Track state changes
    states_seen = []
    
    def on_state_change(state: AgentState):
        states_seen.append(state)
        logger.info(f"✅ State changed to: {state.value}")
    
    def on_transcript(text: str):
        logger.info(f"📝 Transcript: {text}")
    
    def on_response(text: str):
        logger.info(f"💬 Response: {text}")
    
    agent.on_state_change = on_state_change
    agent.on_transcript = on_transcript
    agent.on_response = on_response
    
    try:
        logger.info("1️⃣ Initializing AI components...")
        await agent.initialize()
        logger.info("✅ AI components initialized")
        
        logger.info("2️⃣ Connecting to SFU server...")
        await agent.connect()
        logger.info("✅ Connected to SFU server")
        
        logger.info("3️⃣ Waiting for 10 seconds to test stability...")
        await asyncio.sleep(10)
        
        logger.info("4️⃣ Disconnecting...")
        await agent.disconnect()
        
        logger.info(f"\n📊 Test Results:")
        logger.info(f"  States seen: {[s.value for s in states_seen]}")
        logger.info(f"  Connection state: {agent.pc.connectionState if agent.pc else 'closed'}")
        logger.info(f"  ICE state: {agent.pc.iceConnectionState if agent.pc else 'closed'}")
        
        if AgentState.CONNECTED in states_seen:
            logger.info("✅ Test PASSED - Agent successfully connected!")
        else:
            logger.error("❌ Test FAILED - Agent did not reach CONNECTED state")
        
    except Exception as e:
        logger.error(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            await agent.disconnect()
        except:
            pass


if __name__ == "__main__":
    asyncio.run(test_connection())
