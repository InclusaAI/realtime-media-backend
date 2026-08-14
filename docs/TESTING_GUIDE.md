# Testing Guide - Realtime Media Backend

Quick guide to test all endpoints and WebSocket events.

## Prerequisites

- Service running: `npm start`
- Services running: `docker-compose -f docker-compose.dev.yml up`
- JWT token (see below to generate)

---

## Generate Test JWT Token

### Option 1: Using Node.js

```bash
node -e "console.log(require('jsonwebtoken').sign({roomName: 'test-room', participantIdentity: 'test-user'}, 'your-super-secret-jwt-key-change-in-production', {expiresIn: '1h'}))"
```

Save the output token for testing.

### Option 2: Using Online JWT Tool

Go to https://jwt.io and create a token with:

- **Payload:**

```json
{
  "roomName": "test-room",
  "participantIdentity": "test-user",
  "iat": 1705334400,
  "exp": 1705338000
}
```

- **Secret:** `your-super-secret-jwt-key-change-in-production`

---

## Test 1: Health Checks ✅

### Using cURL

```bash
# Health Check
curl -X GET http://localhost:3001/health

# Readiness Check
curl -X GET http://localhost:3001/health/ready
```

### Expected Response

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

---

## Test 2: REST API Endpoints ✅

### Using Postman

1. Open Postman
2. Create new request
3. Method: `GET`
4. URL: `http://localhost:3001/api`
5. Click Send

### Using cURL

```bash
curl -X GET http://localhost:3001/api
```

### Expected Response

```json
{
  "message": "Realtime Media Backend is running!"
}
```

---

## Test 3: Swagger Documentation ✅

### In Browser

Open: http://localhost:3001/api/docs

You should see:

- All available endpoints documented
- Request/response schemas
- Try it out functionality
- Authorization section for JWT

---

## Test 4: WebSocket Connection 🔌

### Option A: Using Postman (GUI)

1. Create new WebSocket request
2. URL: `ws://localhost:3001`
3. Click Connect
4. Wait for "Connected" message

### Option B: Using wscat (CLI)

```bash
# Install wscat (if not already installed)
npm install -g wscat

# Connect
wscat -c ws://localhost:3001
```

### Expected Response

Connection should be established (no error).

---

## Test 5: WebSocket Join Room Event 🚪

### Using wscat

```bash
# After connecting with wscat, send:
{
  "event": "join-room",
  "data": {
    "token": "livekit-token-here",
    "roomName": "test-room",
    "participantIdentity": "test-user-1"
  }
}
```

### Using Postman (after WebSocket connection)

In the "Messages" tab, send:

```json
{
  "event": "join-room",
  "data": {
    "token": "livekit-token-here",
    "roomName": "test-room",
    "participantIdentity": "test-user-1"
  }
}
```

### Expected Response

```json
{
  "event": "token",
  "data": {
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
  }
}
```

And broadcast to room:

```json
{
  "event": "participant-joined",
  "data": {
    "participantIdentity": "test-user-1"
  }
}
```

---

## Test 6: WebSocket Offer/Answer/ICE ⚡

### Send Offer

```json
{
  "event": "offer",
  "data": {
    "to": "other-socket-id",
    "offer": {
      "type": "offer",
      "sdp": "v=0\r\no=- 123456789 0 IN IP4 127.0.0.1\r\n..."
    }
  }
}
```

### Receive Offer

```json
{
  "event": "offer",
  "data": {
    "from": "sender-socket-id",
    "offer": {
      "type": "offer",
      "sdp": "v=0\r\no=- 123456789 0 IN IP4 127.0.0.1\r\n..."
    }
  }
}
```

### Send Answer

```json
{
  "event": "answer",
  "data": {
    "to": "other-socket-id",
    "answer": {
      "type": "answer",
      "sdp": "v=0\r\no=- 987654321 0 IN IP4 127.0.0.1\r\n..."
    }
  }
}
```

### Send ICE Candidate

```json
{
  "event": "ice-candidate",
  "data": {
    "to": "other-socket-id",
    "candidate": {
      "candidate": "candidate:842163049 1 udp 1677729535 192.168.1.100 54321 typ srflx",
      "sdpMLineIndex": 0,
      "sdpMid": "video"
    }
  }
}
```

---

## Test 7: Leave Room Event 👋

### Using wscat

```bash
{
  "event": "leave-room",
  "data": {
    "roomName": "test-room",
    "participantIdentity": "test-user-1"
  }
}
```

### Expected Response

Broadcast to room:

```json
{
  "event": "participant-left",
  "data": {
    "participantIdentity": "test-user-1"
  }
}
```

---

## Test 8: Kafka Messages 📨

### List Kafka Topics

```bash
docker exec kafka kafka-topics.sh --list --bootstrap-server localhost:9092
```

### Monitor Kafka Messages

```bash
# Listen to participant joined messages
docker exec kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic media.session.test-room.participant.joined \
  --from-beginning

# Listen to participant left messages
docker exec kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic media.session.test-room.participant.left \
  --from-beginning
```

### Expected Output

```json
{
  "participantIdentity": "test-user-1",
  "timestamp": "2024-01-15T10:30:00Z",
  "roomName": "test-room"
}
```

---

## Test 9: Error Handling ⚠️

### Invalid JWT Token

```bash
wscat -c ws://localhost:3001
```

Send join event with invalid token:

```json
{
  "event": "join-room",
  "data": {
    "token": "invalid-token",
    "roomName": "test-room",
    "participantIdentity": "test-user"
  }
}
```

### Expected Response

```json
{
  "event": "error",
  "data": "Authentication failed: invalid token"
}
```

---

## Test 10: Multiple Concurrent Sessions 🔄

### Terminal 1: Start first client

```bash
wscat -c ws://localhost:3001
# Join as user-1
```

### Terminal 2: Start second client

```bash
wscat -c ws://localhost:3001
# Join as user-2
```

### Verify

- Both clients receive `participant-joined` events for each other
- Kafka has 2 join messages
- Both clients can send offers to each other

---

## Troubleshooting Tests

### Connection Refused

```
Error: connect ECONNREFUSED
```

**Solution:** Service not running. Run `npm start`

### Invalid Token Error

```json
{
  "event": "error",
  "data": "Authentication failed: Invalid token"
}
```

**Solution:** JWT token is invalid or expired. Generate a new one.

### Kafka Connection Error

```
Kafka connection failed
```

**Solution:** Kafka not running. Run `docker-compose -f docker-compose.dev.yml up`

### Service Unavailable

```
503 Service Unavailable
```

**Solution:** One or more dependencies not running. Check health endpoint:

```bash
curl http://localhost:3001/health
```

---

## Quick Test Script

Create `test.sh`:

```bash
#!/bin/bash

echo "🧪 Testing Realtime Media Backend"
echo ""

echo "✅ Test 1: Health Check"
curl -s http://localhost:3001/health | jq .

echo ""
echo "✅ Test 2: Readiness Check"
curl -s http://localhost:3001/health/ready | jq .

echo ""
echo "✅ Test 3: Service Info"
curl -s http://localhost:3001/api | jq .

echo ""
echo "📚 Swagger: http://localhost:3001/api/docs"
echo "🔌 WebSocket: ws://localhost:3001"
echo ""
echo "🎉 All basic tests passed!"
```

Run with:

```bash
bash test.sh
```

---

## Load Testing (Advanced)

For testing with multiple concurrent connections, use:

```bash
# Install artillery
npm install -g artillery

# Create artillery.yml with WebSocket scenarios
# See Artillery documentation for WebSocket testing

# Run load test
artillery run artillery.yml
```

---

## Next Steps

✅ All basic tests passing? Great!

1. Review [API_REFERENCE.md](./API_REFERENCE.md) for detailed endpoint documentation
2. Read [TASKS.md](./TASKS.md) to pick next features to implement
3. Start Phase 2.1: Audio Pipeline implementation
