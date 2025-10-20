'use client';

import { useState, useEffect } from 'react';
import { getUserId } from '../../utils/userId';

export default function DebugPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<any>({});
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const id = getUserId();
    setUserId(id);
    addLog(`🆔 User ID: ${id}`);

    // Override console.log to capture logs
    const originalLog = console.log;
    console.log = (...args) => {
      originalLog(...args);
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev.slice(-99), `${new Date().toLocaleTimeString()}: ${message}`]);
    };

    return () => {
      console.log = originalLog;
    };
  }, []);

  const addLog = (message: string) => {
    setLogs(prev => [...prev.slice(-99), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testLocalMedia = async () => {
    try {
      addLog('🎥 Testing camera and microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      
      addLog(`✅ Video tracks: ${videoTracks.length}`);
      videoTracks.forEach(track => {
        addLog(`  📹 ${track.label} - ${track.readyState} - ${track.enabled ? 'enabled' : 'disabled'}`);
      });
      
      addLog(`✅ Audio tracks: ${audioTracks.length}`);
      audioTracks.forEach(track => {
        addLog(`  🎤 ${track.label} - ${track.readyState} - ${track.enabled ? 'enabled' : 'disabled'}`);
      });

      // Stop tracks after test
      stream.getTracks().forEach(track => track.stop());
      addLog('✅ Media test complete - tracks stopped');
    } catch (err: any) {
      addLog(`❌ Media test failed: ${err.message}`);
    }
  };

  const testWebSocket = async () => {
    try {
      addLog('🔌 Testing WebSocket connection...');
      const ws = new WebSocket(`wss://aqlaan.com/ws?room=debug-test&userId=${userId}`);
      
      ws.onopen = () => {
        addLog('✅ WebSocket connected');
        ws.send(JSON.stringify({ type: 'ping' }));
      };
      
      ws.onmessage = (event) => {
        addLog(`📨 Received: ${event.data}`);
      };
      
      ws.onerror = (error) => {
        addLog(`❌ WebSocket error: ${error}`);
      };
      
      ws.onclose = () => {
        addLog('🔌 WebSocket closed');
      };

      // Close after 5 seconds
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
          addLog('🔌 Closing test WebSocket');
        }
      }, 5000);
    } catch (err: any) {
      addLog(`❌ WebSocket test failed: ${err.message}`);
    }
  };

  const testSTUN = async () => {
    try {
      addLog('🧊 Testing STUN servers...');
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      let candidateCount = 0;
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidateCount++;
          const parts = event.candidate.candidate.split(' ');
          const type = parts[7]; // typ host/srflx/relay
          const ip = parts[4];
          addLog(`🧊 ICE Candidate #${candidateCount}: ${type} - ${ip}`);
        } else {
          addLog(`✅ ICE gathering complete - ${candidateCount} candidates found`);
          pc.close();
        }
      };

      // Create an offer to trigger ICE gathering
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      addLog('📤 Created offer, gathering ICE candidates...');
    } catch (err: any) {
      addLog(`❌ STUN test failed: ${err.message}`);
    }
  };

  const testLocalStorage = () => {
    try {
      addLog('💾 Testing localStorage...');
      const testKey = 'aqlinks_test';
      const testValue = Date.now().toString();
      
      localStorage.setItem(testKey, testValue);
      const retrieved = localStorage.getItem(testKey);
      
      if (retrieved === testValue) {
        addLog('✅ localStorage works');
        localStorage.removeItem(testKey);
      } else {
        addLog('❌ localStorage read/write mismatch');
      }

      const userId = localStorage.getItem('aqlinks_user_id');
      addLog(`🆔 Stored User ID: ${userId || 'none'}`);
    } catch (err: any) {
      addLog(`❌ localStorage test failed: ${err.message}`);
    }
  };

  const checkBrowserSupport = () => {
    addLog('🌐 Checking browser support...');
    addLog(`  Browser: ${navigator.userAgent}`);
    addLog(`  getUserMedia: ${!!navigator.mediaDevices?.getUserMedia ? '✅' : '❌'}`);
    addLog(`  RTCPeerConnection: ${!!window.RTCPeerConnection ? '✅' : '❌'}`);
    addLog(`  WebSocket: ${!!window.WebSocket ? '✅' : '❌'}`);
    addLog(`  localStorage: ${!!window.localStorage ? '✅' : '❌'}`);
    addLog(`  HTTPS: ${window.location.protocol === 'https:' ? '✅' : '❌'}`);
  };

  const runAllTests = async () => {
    setLogs([]);
    addLog('🚀 Running all tests...');
    addLog('');
    
    checkBrowserSupport();
    addLog('');
    
    testLocalStorage();
    addLog('');
    
    await testLocalMedia();
    addLog('');
    
    await testSTUN();
    addLog('');
    
    await testWebSocket();
    addLog('');
    
    addLog('✅ All tests complete!');
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const copyLogs = () => {
    const logText = logs.join('\n');
    navigator.clipboard.writeText(logText);
    addLog('📋 Logs copied to clipboard');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">🧪 AqLinks Debug & Test Page</h1>
        
        {/* User ID Display */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="text-xl font-semibold mb-2">User Information</h2>
          <div className="font-mono text-sm">
            <div className="mb-2">
              <span className="text-gray-400">User ID:</span>{' '}
              <span className="text-green-400">{userId}</span>
            </div>
            <div>
              <span className="text-gray-400">Browser:</span>{' '}
              <span className="text-blue-400">{typeof navigator !== 'undefined' ? navigator.userAgent.split(' ').slice(-2).join(' ') : 'Unknown'}</span>
            </div>
          </div>
        </div>

        {/* Test Buttons */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Suite</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <button
              onClick={runAllTests}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-semibold"
            >
              🚀 Run All Tests
            </button>
            <button
              onClick={checkBrowserSupport}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
            >
              🌐 Browser Support
            </button>
            <button
              onClick={testLocalMedia}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded"
            >
              🎥 Test Camera/Mic
            </button>
            <button
              onClick={testSTUN}
              className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded"
            >
              🧊 Test STUN
            </button>
            <button
              onClick={testWebSocket}
              className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded"
            >
              🔌 Test WebSocket
            </button>
            <button
              onClick={testLocalStorage}
              className="bg-pink-600 hover:bg-pink-700 px-4 py-2 rounded"
            >
              💾 Test Storage
            </button>
          </div>
        </div>

        {/* Log Controls */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Test Logs ({logs.length})</h2>
            <div className="flex gap-2">
              <button
                onClick={copyLogs}
                className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
              >
                📋 Copy Logs
              </button>
              <button
                onClick={clearLogs}
                className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
              >
                🗑️ Clear
              </button>
            </div>
          </div>
        </div>

        {/* Logs Display */}
        <div className="bg-black rounded-lg p-4 font-mono text-sm overflow-auto max-h-[600px]">
          {logs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              Click "Run All Tests" to start testing, or run individual tests above.
            </div>
          ) : (
            logs.map((log, index) => (
              <div 
                key={index} 
                className={`mb-1 ${
                  log.includes('❌') ? 'text-red-400' : 
                  log.includes('✅') ? 'text-green-400' : 
                  log.includes('⚠️') ? 'text-yellow-400' : 
                  log.includes('🧊') ? 'text-blue-400' : 
                  log.includes('🆔') ? 'text-purple-400' : 
                  'text-gray-300'
                }`}
              >
                {log}
              </div>
            ))
          )}
        </div>

        {/* Quick Links */}
        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <a
              href="/"
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-center"
            >
              🏠 Main App
            </a>
            <button
              onClick={() => window.open('chrome://webrtc-internals/', '_blank')}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
            >
              📊 WebRTC Stats
            </button>
            <button
              onClick={() => {
                localStorage.clear();
                addLog('🗑️ localStorage cleared');
                window.location.reload();
              }}
              className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded"
            >
              🗑️ Clear Storage
            </button>
            <button
              onClick={() => window.location.reload()}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
            >
              🔄 Reload Page
            </button>
          </div>
        </div>

        {/* Documentation Links */}
        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">📚 Documentation</h2>
          <div className="text-sm text-gray-400 space-y-2">
            <div>• Check <code className="bg-gray-900 px-2 py-1 rounded">TEST_GUIDE.md</code> for detailed testing instructions</div>
            <div>• Check <code className="bg-gray-900 px-2 py-1 rounded">USER_ID_IMPLEMENTATION.md</code> for user ID system details</div>
            <div>• Check <code className="bg-gray-900 px-2 py-1 rounded">VIDEO_DELAY_FIX.md</code> for performance optimization details</div>
            <div>• Check server logs: <code className="bg-gray-900 px-2 py-1 rounded">pm2 logs 18</code></div>
          </div>
        </div>
      </div>
    </div>
  );
}
