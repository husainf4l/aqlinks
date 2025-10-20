# AQL - WebRTC Room Management System

**High-Performance WebRTC Room System - LiveKit Competitor**

A full-stack WebRTC application with separate backend and frontend components designed to outperform LiveKit in performance, cost, and agent integration.

## 📁 Repository Structure

```
aql-project/
├── aql-go/           # Backend: High-performance Go server
│   ├── main.go       # WebRTC server with Pion
│   ├── go.mod        # Go dependencies
│   └── README.md     # Backend documentation
│
└── aqlinks/          # Frontend: Next.js client
    ├── src/          # React components
    ├── package.json  # Node dependencies
    └── README.md     # Frontend documentation
```

## 🎯 Project Goals

Build a WebRTC system that's **20% better than LiveKit**:
- **Performance:** 50,000+ users/server (vs 40k)
- **Latency:** 80ms end-to-end (vs 100ms)
- **Cost:** 20% cheaper to operate
- **Features:** Native AI agent integration

## 🚀 Quick Start

### Backend (Go)
```bash
cd aql-go
go mod tidy
go run main.go
```

### Frontend (Next.js)
```bash
cd aqlinks
npm install
npm run dev
```

## 🏗️ Architecture

- **Backend:** Go + Pion WebRTC + GraphQL
- **Frontend:** Next.js + TypeScript + WebRTC
- **Database:** PostgreSQL + Redis
- **Deployment:** Docker + Kubernetes

## 📊 Performance Targets

| Metric | Target | LiveKit | Improvement |
|--------|--------|---------|-------------|
| Users/Server | 50,000+ | 40,000 | +25% |
| Latency | <80ms | <100ms | +20% |
| Memory | -20% | Baseline | More efficient |
| Cost | -20% | Baseline | Cheaper |

## 🔧 Development

### Prerequisites
- Go 1.25+
- Node.js 18+
- PostgreSQL
- Redis

### Setup
```bash
# Clone repository
git clone https://github.com/husainf4l/aqlinks.git
cd aqlinks

# Setup backend
cd aql-go
go mod tidy

# Setup frontend
cd ../aqlinks
npm install
```

## 📈 Roadmap

- **Phase 1:** Core room management (Week 1-2)
- **Phase 2:** WebRTC integration (Week 3-4)
- **Phase 3:** Agent support (Week 5-6)
- **Phase 4:** Production ready (Week 7-8)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.

---

**Built to compete with LiveKit, designed to exceed it.** 🚀