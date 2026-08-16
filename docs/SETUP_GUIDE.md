# Setup Guide - Realtime Media Backend

## Prerequisites

- Node.js 20+
- npm or yarn
- Docker & Docker Compose (for services: LiveKit, Kafka, Redis)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment Variables

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and update values as needed
# For local development with docker-compose, defaults should work
```

### 3. Start Services (Docker Compose)

```bash
# Start LiveKit, Kafka, Redis
docker-compose -f docker-compose.dev.yml up -d

# Verify services are running
docker-compose -f docker-compose.dev.yml ps
```

### 4. Start the Application

```bash
npm start
```

The service will start on `http://localhost:3001`

### 5. Access Documentation & Health Checks

- **Swagger API Docs:** http://localhost:3001/api/docs
- **Health Check:** http://localhost:3001/health
- **Readiness Check:** http://localhost:3001/health/ready
- **WebSocket Endpoint:** ws://localhost:3001

---

## Configuration Details

### Environment Variables

| Variable                            | Default                | Description                              |
| ----------------------------------- | ---------------------- | ---------------------------------------- |
| `NODE_ENV`                          | development            | Environment mode                         |
| `PORT`                              | 3001                   | Application port                         |
| `JWT_SECRET`                        | (required)             | Secret for JWT token validation          |
| `LIVEKIT_SERVER_URL`                | http://localhost:7880  | LiveKit server URL                       |
| `LIVEKIT_API_KEY`                   | devkey                 | LiveKit API key                          |
| `LIVEKIT_API_SECRET`                | secret                 | LiveKit API secret                       |
| `KAFKA_BROKERS`                     | localhost:9092         | Kafka broker addresses                   |
| `REDIS_URL`                         | redis://localhost:6379 | Redis connection URL                     |
| `VIDEO_SAMPLE_RATE_FPS`             | 15                     | Video sampling rate for sign recognition |
| `SESSION_RECONNECT_GRACE_PERIOD_MS` | 30000                  | Grace period for reconnections (30s)     |

### Docker Compose Services

```yaml
Services:
  - LiveKit: http://localhost:7880
    API Key: devkey
    API Secret: secret

  - Kafka: localhost:9092
    Zookeeper: localhost:2181

  - Redis: localhost:6379
```

---

## API Endpoints

### Health & Readiness

#### Health Check

```
GET /health
```

Returns the health status of all services.

**Response (200 OK):**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "kafka": { "status": "up" },
    "redis": { "status": "up" },
    "livekit": { "status": "up" }
  }
}
```

#### Readiness Check

```
GET /health/ready
```

Returns 200 only if service is ready to accept requests.

---

## WebSocket API (Signaling)

### Connection

```javascript
const socket = io("http://localhost:3001", {
  auth: {
    token: "your-jwt-token",
  },
});
```

### Events Emitted by Client

#### 1. Join Room

```javascript
socket.emit("join-room", {
  token: "jwt-token",
  roomName: "room-123",
  participantIdentity: "user-456",
});
```

**Server Response:**

```javascript
socket.on("token", (data) => {
  console.log("LiveKit token:", data.token);
});

socket.on("participant-joined", (data) => {
  console.log("Participant joined:", data.participantIdentity);
});
```

#### 2. Leave Room

```javascript
socket.emit("leave-room", {
  roomName: "room-123",
  participantIdentity: "user-456",
});
```

**Server Response:**

```javascript
socket.on("participant-left", (data) => {
  console.log("Participant left:", data.participantIdentity);
});
```

#### 3. Send Offer

```javascript
socket.emit("offer", {
  to: "recipient-socket-id",
  offer: {
    type: "offer",
    sdp: "...",
  },
});
```

**Receive Offer:**

```javascript
socket.on("offer", (data) => {
  console.log("Offer from:", data.from);
  console.log("Offer:", data.offer);
});
```

#### 4. Send Answer

```javascript
socket.emit("answer", {
  to: "recipient-socket-id",
  answer: {
    type: "answer",
    sdp: "...",
  },
});
```

**Receive Answer:**

```javascript
socket.on("answer", (data) => {
  console.log("Answer from:", data.from);
  console.log("Answer:", data.answer);
});
```

#### 5. Send ICE Candidate

```javascript
socket.emit("ice-candidate", {
  to: "recipient-socket-id",
  candidate: {
    candidate: "...",
    sdpMLineIndex: 0,
    sdpMid: "video",
  },
});
```

**Receive ICE Candidate:**

```javascript
socket.on("ice-candidate", (data) => {
  console.log("ICE Candidate from:", data.from);
  console.log("Candidate:", data.candidate);
});
```

---

## Testing Endpoints

### Using cURL for REST Endpoints

```bash
# Health Check
curl http://localhost:3001/health

# Readiness Check
curl http://localhost:3001/health/ready
```

### Using Postman for WebSocket

1. Open Postman
2. Create a new WebSocket request
3. URL: `ws://localhost:3001`
4. Click Connect
5. Send events as JSON messages

**Example Message:**

```json
{
  "event": "join-room",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "roomName": "test-room",
    "participantIdentity": "test-user"
  }
}
```

### Using WebSocket CLI Tool

```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c ws://localhost:3001

# Send join-room event
{
  "event": "join-room",
  "data": {
    "token": "your-jwt-token",
    "roomName": "test-room",
    "participantIdentity": "test-user"
  }
}
```

---

## Development Tips

### View Live Logs

```bash
npm start
```

### Run Tests

```bash
npm test
```

### Stop Services

```bash
docker-compose -f docker-compose.dev.yml down
```

### Reset Services (Clean)

```bash
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
```

### Check Service Status

```bash
# Kafka topics
docker exec kafka kafka-topics.sh --list --bootstrap-server localhost:9092

# Redis
docker exec redis redis-cli ping

# LiveKit health
curl http://localhost:7880/api/status
```

---

## Generate JWT Token for Testing

Use this Node.js script to generate a test token:

```javascript
const jwt = require("jsonwebtoken");

const token = jwt.sign(
  {
    roomName: "test-room",
    participantIdentity: "test-user",
    sub: "test-user",
  },
  "your-super-secret-jwt-key-change-in-production",
  {
    expiresIn: "1h",
  },
);

console.log("JWT Token:", token);
```

Or use this command:

```bash
node -e "console.log(require('jsonwebtoken').sign({roomName: 'test-room', participantIdentity: 'test-user'}, 'your-super-secret-jwt-key-change-in-production', {expiresIn: '1h'}))"
```

---

## Troubleshooting

### Services Not Starting

```bash
# Check Docker services
docker ps

# Check logs
docker-compose -f docker-compose.dev.yml logs -f
```

### Kafka Connection Error

```bash
# Verify Kafka is running
docker exec kafka kafka-brokers.sh --bootstrap-server localhost:9092 --describe

# Check KAFKA_BROKERS env var is set correctly
echo $KAFKA_BROKERS
```

### JWT Token Error

```bash
# Verify JWT_SECRET is set in .env
grep JWT_SECRET .env

# Regenerate token with correct secret (must match .env)
```

### Redis Connection Error

```bash
# Test Redis connection
docker exec redis redis-cli ping
# Should return: PONG

# Check REDIS_URL in .env
echo $REDIS_URL
```

### LiveKit Connection Error

```bash
# Check if LiveKit is running
curl http://localhost:7880/api/status

# Verify credentials in .env
grep LIVEKIT .env
```

---

## Next Steps

1. ✅ **Health Checks Working** - Verify all services are up
2. 📚 **Review Swagger Docs** - http://localhost:3001/api/docs
3. 🔌 **Test WebSocket Connection** - Use Postman or wscat
4. 📝 **Read TASKS.md** - For feature implementation tasks
5. 🎬 **Implement Audio Pipeline** - See Phase 2.1 in TASKS.md
