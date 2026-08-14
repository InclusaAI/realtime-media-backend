# Quick Reference Card

## 🚀 Local Development Commands

```bash
# Setup (first time only)
cp .env.example .env
npm install

# Start infrastructure (terminal 1)
docker-compose -f docker-compose.dev.yml up -d

# Start application (terminal 2)
npm start

# Stop everything
docker-compose -f docker-compose.dev.yml down

# Clean restart
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
npm start
```

---

## 🔗 Important URLs

| Service          | URL                            | Purpose              |
| ---------------- | ------------------------------ | -------------------- |
| App              | http://localhost:3001          | Main API             |
| Swagger API Docs | http://localhost:3001/api/docs | Interactive testing  |
| Health Check     | http://localhost:3001/health   | Service status       |
| WebSocket        | ws://localhost:3001            | Signaling connection |
| LiveKit          | http://localhost:7880          | SFU server           |
| Kafka            | localhost:9092                 | Message broker       |
| Redis            | localhost:6379                 | Cache/store          |

---

## 🧪 Quick Tests

```bash
# Health check
curl http://localhost:3001/health

# Readiness check
curl http://localhost:3001/health/ready

# List Kafka topics
docker exec kafka kafka-topics.sh --list --bootstrap-server localhost:9092

# Monitor Kafka messages
docker exec kafka kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic media.session.test-room.participant.joined --from-beginning
```

---

## 📡 WebSocket Connection (wscat)

```bash
# Install
npm install -g wscat

# Connect
wscat -c ws://localhost:3001

# Send join-room event (paste into wscat):
{
  "event": "join-room",
  "data": {
    "token": "your-livekit-token",
    "roomName": "test-room",
    "participantIdentity": "test-user"
  }
}
```

---

## 🔐 Generate JWT Token

```bash
# Option 1: One-liner
node -e "console.log(require('jsonwebtoken').sign({roomName: 'test-room', participantIdentity: 'test-user'}, 'your-super-secret-jwt-key-change-in-production', {expiresIn: '1h'}))"

# Option 2: In Node REPL
node
> const jwt = require('jsonwebtoken');
> jwt.sign({roomName: 'test', participantIdentity: 'user'}, process.env.JWT_SECRET, {expiresIn: '1h'})
```

---

## 📋 Documentation Quick Links

| Document | Purpose             | Quick Link                                 |
| -------- | ------------------- | ------------------------------------------ |
| Setup    | Get running locally | [SETUP_GUIDE.md](./SETUP_GUIDE.md)         |
| Tasks    | Pick next feature   | [TASKS.md](./TASKS.md)                     |
| Testing  | Test endpoints      | [TESTING_GUIDE.md](./TESTING_GUIDE.md)     |
| API Ref  | Endpoint details    | [API_REFERENCE.md](./API_REFERENCE.md)     |
| Overview | Project summary     | [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) |
| Config   | Environment vars    | [.env.example](./.env.example)             |

---

## 🎯 Top 5 Next Tasks

1. **Run Setup** → Follow [SETUP_GUIDE.md](./SETUP_GUIDE.md)
2. **Test Health** → `curl http://localhost:3001/health`
3. **View Swagger** → http://localhost:3001/api/docs
4. **Test WebSocket** → Use [TESTING_GUIDE.md](./TESTING_GUIDE.md)
5. **Pick Task** → Read [TASKS.md](./TASKS.md) → Start Phase 2.1

---

## ⚠️ Common Issues & Fixes

| Issue                   | Fix                                                |
| ----------------------- | -------------------------------------------------- |
| `npm start` fails       | Run `npm install` first                            |
| Port 3001 in use        | Kill process: `lsof -i :3001` then `kill -9 <PID>` |
| Kafka connection failed | Check: `docker ps \| grep kafka`                   |
| Redis connection failed | Check: `docker ps \| grep redis`                   |
| JWT token error         | Regenerate token, ensure secret matches            |
| Health check failing    | Run: `docker-compose -f docker-compose.dev.yml ps` |

---

## 📊 Project Structure

```
realtime-media-backend/
├── apps/media-control/src/
│   ├── main.ts                 ← Entry point
│   ├── media-control.module.ts ← Module config
│   ├── media-control.controller.ts
│   ├── health/                 ← Health checks (NEW)
│   ├── sfu-adapter/            ← LiveKit integration
│   ├── audio-tap/              ← Audio capture (TO DO)
│   ├── egress/                 ← Video egress (TO DO)
│   └── config/                 ← Configuration
│
├── Documentation
│   ├── SETUP_GUIDE.md          ← Start here
│   ├── TASKS.md                ← Feature list
│   ├── TESTING_GUIDE.md        ← Test procedures
│   ├── API_REFERENCE.md        ← Endpoints
│   └── PROJECT_SUMMARY.md      ← Overview
│
└── Infrastructure
    ├── docker-compose.dev.yml  ← Local services
    ├── Dockerfile              ← App container
    ├── .env.example            ← Configuration template
    └── package.json            ← Dependencies
```

---

## 🔄 Development Workflow

1. **Pick Task** from [TASKS.md](./TASKS.md)
2. **Read Phase** description
3. **Implement Code** in `apps/media-control/src/`
4. **Test Locally** using health check / Swagger
5. **Verify** in Kafka topics if applicable
6. **Update** .md files if adding new endpoints
7. **Mark Complete** in TASKS.md

---

## 🚀 When Ready to Deploy

1. Update production `.env` file
2. Build Docker image: `docker build -t realtime-media-backend .`
3. Push to registry
4. Deploy with Helm (see Phase 6 in TASKS.md)
5. Verify health checks in production
6. Monitor logs & metrics

---

## 💾 Important Environment Variables

```bash
# Core
NODE_ENV=development
PORT=3001
JWT_SECRET=your-secret-key

# LiveKit
LIVEKIT_SERVER_URL=http://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret

# Kafka
KAFKA_BROKERS=localhost:9092

# Redis
REDIS_URL=redis://localhost:6379

# Feature Flags
SESSION_RECONNECT_GRACE_PERIOD_MS=30000
VIDEO_SAMPLE_RATE_FPS=15
```

---

## 🎓 Key Concepts to Remember

- **SFU (Selective Forwarding Unit)**: LiveKit - forwards media selectively
- **Signaling**: WebSocket events (offer/answer/ice-candidate)
- **Kafka Topics**: Publish participant events and media chunks
- **Redis**: Store ephemeral session state
- **15fps**: Video sampling rate for sign recognition
- **30s Grace Period**: Reconnection window for live events

---

## 📞 When Stuck

1. Check [SETUP_GUIDE.md](./SETUP_GUIDE.md) troubleshooting
2. Check [TESTING_GUIDE.md](./TESTING_GUIDE.md) for endpoint examples
3. Review [TASKS.md](./TASKS.md) known issues section
4. Check health endpoint: `curl http://localhost:3001/health`
5. Review Swagger docs: http://localhost:3001/api/docs

---

## ✅ Done Checklist

- [x] Project analyzed & documented
- [x] Code fixes applied (JWT, Kafka, Health checks)
- [x] Swagger setup complete
- [x] Setup guide written
- [x] Testing guide written
- [x] API reference written
- [x] Task list created
- [x] Documentation complete

**→ Ready to start development! 🚀**

---

_Quick Reference v1.0_  
_Last Updated: 2024-01-15_
