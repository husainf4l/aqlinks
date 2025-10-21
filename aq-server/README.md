# AQ Server - Video Conference SFU

A production-ready WebRTC Selective Forwarding Unit (SFU) server with real-time chat, built with Go and Pion WebRTC.

## 🏗️ Project Structure

```
aq-server/
├── cmd/
│   └── server/
│       └── main.go              # Application entry point
├── internal/                    # Private application code
│   ├── config/
│   │   └── config.go           # Configuration management
│   ├── handler/
│   │   ├── http.go             # HTTP request handlers
│   │   └── websocket.go        # WebSocket handler for WebRTC signaling
│   ├── service/
│   │   ├── sfu.go              # SFU service (track management, peer connections)
│   │   └── chat.go             # Chat service (message broadcasting)
│   ├── model/
│   │   └── message.go          # Data structures (messages, peer state)
│   └── server/
│       └── server.go           # Server initialization and setup
├── web/
│   └── templates/
│       └── index.html          # Frontend UI
├── go.mod                      # Go module definition
├── go.sum                      # Dependency checksums
└── README.md                   # This file
```

## 🎯 Architecture Principles

This project follows **Go best practices as of October 2025**:

### 1. **Standard Project Layout**
- `cmd/` - Application entry points
- `internal/` - Private application code (cannot be imported by external projects)
- `web/` - Web assets (templates, static files)

### 2. **Separation of Concerns**
- **Handlers** - HTTP/WebSocket request handling
- **Services** - Business logic (SFU, Chat)
- **Models** - Data structures
- **Config** - Configuration management
- **Server** - Application setup and routing

### 3. **Dependency Injection**
- Services are created and injected into handlers
- Promotes testability and loose coupling

### 4. **Clean Interfaces**
- Clear separation between layers
- Services expose only necessary methods

## 🚀 Quick Start

### Build and Run

```bash
# From project root
go run cmd/server/main.go

# Or build a binary
go build -o bin/aq-server cmd/server/main.go
./bin/aq-server
```

### Configuration

Configuration via flags or environment variables:

```bash
# Using flags
go run cmd/server/main.go -addr :8080 -prefix /aq_server

# Using environment variables
export SERVER_ADDR=:8080
export PATH_PREFIX=/aq_server
go run cmd/server/main.go
```

### Access

- **Local**: http://localhost:8080/aq_server/
- **Production**: https://aqlaan.com/aq_server/

## 📦 Components

### SFU Service (`internal/service/sfu.go`)
Manages WebRTC media forwarding:
- Track management (add/remove)
- Peer connection lifecycle
- Offer/Answer negotiation
- Keyframe dispatching

### Chat Service (`internal/service/chat.go`)
Handles real-time messaging:
- Message broadcasting
- Sender filtering (don't echo back)

### WebSocket Handler (`internal/handler/websocket.go`)
Processes WebSocket messages:
- WebRTC signaling (offer, answer, ICE candidates)
- Chat messages
- Connection lifecycle

### HTTP Handler (`internal/handler/http.go`)
Serves web interface:
- Index page with dynamic WebSocket URL
- HTTPS/WSS detection

## 🔧 Key Features

- ✅ **Multi-party video conferencing** - Everyone sees everyone
- ✅ **Real-time chat** - WebSocket-based messaging
- ✅ **SFU architecture** - Efficient media forwarding
- ✅ **Clean separation** - Testable, maintainable code
- ✅ **Configuration** - Flags and environment variables
- ✅ **Logging** - Structured logging with Pion logger
- ✅ **Thread-safe** - Proper synchronization
- ✅ **Production-ready** - Timeouts, error handling

## 📚 API Reference

### WebSocket Messages

**Client → Server:**

```json
// ICE Candidate
{"event": "candidate", "data": "{\"candidate\":\"...\"}"}

// SDP Answer
{"event": "answer", "data": "{\"type\":\"answer\",\"sdp\":\"...\"}"}

// Chat Message
{"event": "chat", "data": "Hello, world!"}
```

**Server → Client:**

```json
// SDP Offer
{"event": "offer", "data": "{\"type\":\"offer\",\"sdp\":\"...\"}"}

// ICE Candidate
{"event": "candidate", "data": "{\"candidate\":\"...\"}"}

// Chat Message
{"event": "chat", "message": "Hello, world!", "time": "14:30:45"}
```

## 🧪 Testing

```bash
# Run tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run tests with race detector
go test -race ./...
```

## 🔐 Security

- ✅ **HTML escaping** - XSS protection in chat
- ✅ **WebSocket validation** - Origin checking
- ✅ **HTTPS/WSS** - Encrypted connections
- ✅ **Thread-safe operations** - Proper locking

## 📈 Performance

- **Concurrent connections**: Handles multiple peers efficiently
- **Media forwarding**: Zero-copy RTP packet forwarding
- **Goroutines**: Concurrent track processing
- **Memory efficient**: No media transcoding

## 🚢 Deployment

### NGINX Configuration

```nginx
location /aq_server/websocket {
    proxy_pass http://localhost:8080/aq_server/websocket;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location /aq_server/ {
    proxy_pass http://localhost:8080/aq_server/;
}
```

### Systemd Service

```ini
[Unit]
Description=AQ Server - Video Conference SFU
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/aq-server
ExecStart=/opt/aq-server/bin/aq-server
Restart=always

[Install]
WantedBy=multi-user.target
```

## 🛠️ Development

### Add a New Feature

1. **Model** - Define data structures in `internal/model/`
2. **Service** - Implement business logic in `internal/service/`
3. **Handler** - Add HTTP/WebSocket handlers in `internal/handler/`
4. **Wire up** - Connect in `internal/server/server.go`

### Code Style

- Follow [Effective Go](https://golang.org/doc/effective_go)
- Use `gofmt` for formatting
- Run `golint` for linting
- Document exported functions

## 📝 License

SPDX-License-Identifier: MIT

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For issues and questions:
- GitHub Issues: [github.com/husainf4l/aqlinks](https://github.com/husainf4l/aqlinks)
- Documentation: See `CHAT_FEATURE.md` and `STATUS.md`

---

**Built with ❤️ using Go and Pion WebRTC**
