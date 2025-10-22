'use client';

import Image from "next/image";
import Link from "next/link";

export default function Playground() {
  return (
    <>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
      
      <div className="min-h-screen bg-linear-to-br from-black via-neutral-900 to-black">
        {/* Modal */}
        <div id="roomModal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xl">
          <div className="w-full max-w-md rounded-3xl bg-neutral-900/95 p-8 shadow-2xl border border-neutral-800/50 mx-4 sm:mx-0">
            <div className="mb-2 inline-block rounded-full bg-blue-500/10 px-3 py-1">
              <span className="text-xs font-semibold text-blue-400">Join Session</span>
            </div>
            <h2 className="mb-8 text-3xl font-bold tracking-tight text-white">Video Room</h2>
            
            <div className="mb-6 text-left">
              <label htmlFor="roomInput" className="mb-2 block text-sm font-semibold text-neutral-200">Room ID</label>
              <input 
                type="text" 
                id="roomInput" 
                placeholder="e.g., room-123" 
                defaultValue="default"
                className="w-full rounded-xl border border-neutral-700/50 bg-neutral-800/50 px-4 py-3 text-sm text-white placeholder-neutral-500 transition-all focus:border-blue-500 focus:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
            </div>
            
            <div className="mb-6 text-left">
              <label htmlFor="usernameInput" className="mb-2 block text-sm font-semibold text-neutral-200">Your Name</label>
              <input 
                type="text" 
                id="usernameInput" 
                placeholder="Enter your name" 
                defaultValue="User"
                className="w-full rounded-xl border border-neutral-700/50 bg-neutral-800/50 px-4 py-3 text-sm text-white placeholder-neutral-500 transition-all focus:border-blue-500 focus:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
            </div>
            
            <div className="mb-8 text-left">
              <label htmlFor="userTypeInput" className="mb-2 block text-sm font-semibold text-neutral-200">Role</label>
              <select 
                id="userTypeInput"
                className="w-full rounded-xl border border-neutral-700/50 bg-neutral-800/50 px-4 py-3 text-sm text-white transition-all focus:border-blue-500 focus:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              >
                <option value="guest">Guest</option>
                <option value="host">Host</option>
                <option value="presenter">Presenter</option>
              </select>
            </div>
            
            <button 
              id="joinBtn"
              className="w-full rounded-xl bg-linear-to-r from-blue-600 to-blue-700 py-3 font-semibold text-white transition-all hover:shadow-lg hover:shadow-blue-500/25 active:scale-95"
            >
              Join Room
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 p-4 sm:p-6 lg:p-10 h-screen max-h-screen">
          {/* Video Section - Main Focus */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="mb-4">
              <h3 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">Live Session</h3>
              <div 
                id="roomBadge" 
                className="hidden rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-300 backdrop-blur-sm mt-4"
              >
                📍 <strong id="roomName">default</strong> • 👤 <strong id="userName">User</strong>
              </div>
            </div>
            
            {/* Main Video Container */}
            <div className="relative flex-1 rounded-2xl bg-black overflow-hidden shadow-2xl border border-neutral-800/50 min-h-0">
              {/* Remote Videos - Main Display */}
              <div id="remoteVideos" className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-blue-500/20 mx-auto mb-4"></div>
                  <p className="text-neutral-400 text-sm">Waiting for participants...</p>
                </div>
              </div>
              
              {/* Local Video - Picture in Picture */}
              <div className="absolute bottom-4 right-4 w-28 h-20 sm:w-36 sm:h-28 rounded-xl overflow-hidden border-2 border-neutral-700 shadow-lg bg-black">
                <video 
                  id="localVideo" 
                  width="144" 
                  height="108" 
                  autoPlay 
                  muted
                  className="w-full h-full object-cover"
                ></video>
              </div>
            </div>
          </div>

          {/* Chat Section */}
          <div className="w-full lg:w-96 flex flex-col rounded-2xl border border-neutral-800/50 bg-neutral-900/50 backdrop-blur-sm shadow-xl min-h-96 lg:min-h-0">
            <div className="border-b border-neutral-800/50 p-4 sm:p-6 shrink-0">
              <h3 className="text-xl font-bold tracking-tight text-white">Messages</h3>
            </div>
            
            <div 
              id="chatMessages" 
              className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 min-h-0"
            ></div>
            
            <div className="border-t border-neutral-800/50 p-4 sm:p-6 space-y-3 shrink-0">
              <input 
                type="text" 
                id="chatInput" 
                placeholder="Type a message..." 
                className="w-full rounded-xl border border-neutral-700/50 bg-neutral-800/50 px-4 py-3 text-sm text-white placeholder-neutral-500 transition-all focus:border-blue-500 focus:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
              <button 
                id="sendBtn"
                className="w-full rounded-xl bg-linear-to-r from-blue-600 to-blue-700 px-6 py-3 font-semibold text-white transition-all hover:shadow-lg hover:shadow-blue-500/25 active:scale-95"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{__html: `
        // JWT Configuration
        const JWT_SECRET = "tt55oo77"
        
        // Room and connection state
        let currentRoom = 'default'
        let currentUsername = 'User'
        let currentUserType = 'guest'
        let roomJoined = false

        // Connection state
        let reconnectAttempts = 0
        const maxReconnectAttempts = 10
        const baseReconnectDelay = 1000
        let reconnectTimer = null

        // JWT Token generation function
        function generateJWTToken(userId, room, userType) {
          const now = Math.floor(Date.now() / 1000)
          const exp = now + (24 * 60 * 60)
          
          const header = {
            alg: "HS256",
            typ: "JWT"
          }
          
          const payload = {
            user_id: userId,
            email: \`\${userId}@example.com\`,
            room: room,
            user_type: userType,
            iat: now,
            exp: exp
          }
          
          const headerEncoded = btoa(JSON.stringify(header)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, '')
          const payloadEncoded = btoa(JSON.stringify(payload)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, '')
          
          const signatureInput = \`\${headerEncoded}.\${payloadEncoded}\`
          const signature = CryptoJS.HmacSHA256(signatureInput, JWT_SECRET)
          const signatureEncoded = signature.toString(CryptoJS.enc.Base64).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, '')
          
          const token = \`\${signatureInput}.\${signatureEncoded}\`
          return token
        }

        // Room management functions
        function getUrlParams() {
          const params = new URLSearchParams(window.location.search)
          return {
            room: params.get('room') || '',
            username: params.get('username') || ''
          }
        }

        function showRoomBadge(room, username, userType) {
          document.getElementById('roomName').textContent = room
          document.getElementById('userName').textContent = username
          document.getElementById('roomBadge').style.display = 'block'
          currentRoom = room
          currentUsername = username
          currentUserType = userType
        }

        function hideRoomModal() {
          document.getElementById('roomModal').classList.add('hidden')
        }

        function showRoomModal() {
          document.getElementById('roomModal').classList.remove('hidden')
        }

        function handleRoomJoin() {
          const room = document.getElementById('roomInput').value.trim() || 'default'
          const username = document.getElementById('usernameInput').value.trim() || 'User'
          const userType = document.getElementById('userTypeInput').value || 'guest'
          showRoomBadge(room, username, userType)
          hideRoomModal()
          roomJoined = true
          return { room, username, userType }
        }

        function initRoomSelection() {
          const urlParams = getUrlParams()
          
          if (urlParams.room) {
            const room = urlParams.room
            const username = urlParams.username || 'User'
            showRoomBadge(room, username, 'guest')
            hideRoomModal()
            return Promise.resolve({ room, username, userType: 'guest' })
          }
          
          showRoomModal()
          
          return new Promise((resolve) => {
            document.getElementById('joinBtn').onclick = () => {
              const result = handleRoomJoin()
              resolve(result)
            }
            
            document.getElementById('usernameInput').addEventListener('keypress', (e) => {
              if (e.key === 'Enter') {
                const result = handleRoomJoin()
                resolve(result)
              }
            })
          })
        }

        // Chat functions
        function addChatMessage(message, time) {
          const chatMessages = document.getElementById('chatMessages')
          const msgDiv = document.createElement('div')
          msgDiv.className = 'mb-2 rounded-2xl bg-neutral-700 px-4 py-3 text-sm text-white break-words'
          msgDiv.innerHTML = \`
            <div class="text-xs text-neutral-400 mb-1">\${time}</div>
            <div>\${escapeHtml(message)}</div>
          \`
          chatMessages.appendChild(msgDiv)
          chatMessages.scrollTop = chatMessages.scrollHeight
        }

        function escapeHtml(text) {
          const div = document.createElement('div')
          div.textContent = text
          return div.innerHTML
        }

        function sendChatMessage(ws) {
          const input = document.getElementById('chatInput')
          const message = input.value.trim()
          if (!message) return

          if (ws.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket is not connected, message not sent')
            return
          }

          ws.send(JSON.stringify({
            event: 'chat',
            data: message
          }))

          const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          addChatMessage(\`You: \${message}\`, now)
          
          input.value = ''
        }

        // Calculate exponential backoff with jitter
        function getReconnectDelay(attempt) {
          const delay = Math.min(baseReconnectDelay * Math.pow(2, attempt), 30000)
          const jitter = Math.random() * 1000
          return delay + jitter
        }

        // Initiate reconnection with exponential backoff
        function scheduleReconnect(stream, pc) {
          if (reconnectAttempts >= maxReconnectAttempts) {
            console.error('Max reconnection attempts reached')
            addChatMessage('Connection lost', new Date().toLocaleTimeString())
            return
          }

          const delay = getReconnectDelay(reconnectAttempts)
          reconnectAttempts++
          
          console.log(\`Reconnecting in \${Math.round(delay)}ms (attempt \${reconnectAttempts}/\${maxReconnectAttempts})\`)
          addChatMessage(\`Reconnecting...\`, new Date().toLocaleTimeString())

          reconnectTimer = setTimeout(() => {
            initializeWebSocket(stream, pc, currentRoom, currentUsername, currentUserType)
          }, delay)
        }

        // Initialize WebSocket with reconnection logic
        function initializeWebSocket(stream, pc, room, username, userType) {
          const token = generateJWTToken(username, room, userType)
          
          const SERVER_URL = "http://localhost:8080"
          const baseWsUrl = \`ws://localhost:8080/aq_server/ws\`
          
          const wsUrl = \`\${baseWsUrl}?token=\${encodeURIComponent(token)}\`
          
          console.log('Connecting to WebSocket with JWT token')
          let ws = new WebSocket(wsUrl)
          
          ws.onopen = function() {
            console.log('WebSocket connected')
            reconnectAttempts = 0
            addChatMessage('Connected to server', new Date().toLocaleTimeString())
          }

          ws.onclose = function(evt) {
            console.log('WebSocket closed, scheduling reconnect...')
            scheduleReconnect(stream, pc)
          }

          ws.onmessage = function(evt) {
            let msg = JSON.parse(evt.data)
            if (!msg) {
              return console.log('failed to parse msg')
            }

            switch (msg.event) {
              case 'offer':
                let offer = JSON.parse(msg.data)
                if (!offer) {
                  return console.log('failed to parse offer')
                }
                pc.setRemoteDescription(offer)
                pc.createAnswer().then(answer => {
                  pc.setLocalDescription(answer)
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({event: 'answer', data: JSON.stringify(answer)}))
                  }
                })
                return

              case 'candidate':
                let candidate = JSON.parse(msg.data)
                if (!candidate) {
                  return console.log('failed to parse candidate')
                }

                pc.addIceCandidate(candidate).catch(err => {
                  console.warn('Failed to add ICE candidate:', err)
                })
                return

              case 'chat':
                addChatMessage(\`Remote: \${msg.message}\`, msg.time)
                return
            }
          }

          ws.onerror = function(evt) {
            console.error("WebSocket ERROR: " + evt.data)
          }

          document.getElementById('sendBtn').addEventListener('click', () => sendChatMessage(ws))
          
          document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              sendChatMessage(ws)
            }
          })

          pc.onicecandidate = e => {
            if (!e.candidate) {
              return
            }

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({event: 'candidate', data: JSON.stringify(e.candidate)}))
            }
          }

          return ws
        }

        // Initialize application
        async function initialize() {
          try {
            const { room, username, userType } = await initRoomSelection()
            
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            
            let pc = new RTCPeerConnection()
            pc.ontrack = function (event) {
              if (event.track.kind === 'audio') {
                return
              }

              let el = document.createElement(event.track.kind)
              el.srcObject = event.streams[0]
              el.autoplay = true
              el.controls = false
              el.className = 'w-full h-full object-cover'
              
              // Get the remote videos container
              const remoteVideos = document.getElementById('remoteVideos')
              
              // Clear the placeholder if this is the first video
              if (remoteVideos.children.length === 1 && remoteVideos.querySelector('div')) {
                remoteVideos.innerHTML = ''
              }
              
              remoteVideos.appendChild(el)

              event.track.onmute = function(event) {
                if (el.parentNode) {
                  el.play().catch(() => {})
                }
              }

              event.streams[0].onremovetrack = ({track}) => {
                if (el.parentNode) {
                  el.parentNode.removeChild(el)
                }
              }
            }

            document.getElementById('localVideo').srcObject = stream
            stream.getTracks().forEach(track => pc.addTrack(track, stream))

            initializeWebSocket(stream, pc, room, username, userType)
          } catch (err) {
            console.error('Initialization error:', err)
            alert('Error: ' + err.message)
          }
        }

        initialize()
      `}}></script>
    </>
  );
}