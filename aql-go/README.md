# WebRTC SFU in Go

A basic WebRTC Selective Forwarding Unit (SFU) implemented in Go using the Pion WebRTC library.

## Features

- Supports multiple clients in a single room
- Forwards media streams between clients
- WebSocket-based signaling
- STUN server for ICE

## Running the Server

1. Ensure Go is installed.
2. Run `go mod tidy` to download dependencies.
3. Run `go run main.go` to start the server on port 8080.

## Signaling

Clients connect via WebSocket to `/ws` (with optional `?room=room-id`).

Send JSON messages:
- `{"type": "offer", "data": <SDP offer>}` (initial or renegotiation)
- `{"type": "answer", "data": <SDP answer>}`
- `{"type": "candidate", "data": <ICE candidate>}`

Receive:
- `{"type": "offer", "data": <SDP offer>}` (for renegotiation)
- `{"type": "answer", "data": <SDP answer>}` (initial)
- `{"type": "candidate", "data": <ICE candidate>}`

## Testing

1. Start the server: `go run main.go`
2. Open `test.html` in multiple browser tabs (Chrome recommended for WebRTC).
3. Enter the same room name in each tab and click "Join Room".
4. In each tab, click "Start Media" to begin publishing video/audio.
5. Media should forward between clients in the same room.

For custom rooms, change the room input before joining.