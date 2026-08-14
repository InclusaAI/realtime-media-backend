# API Reference - Realtime Media Backend

## Overview

This document provides a detailed reference of all REST API and WebSocket endpoints for the Realtime Media Backend service.

---

## 1. Health & Status Endpoints

### 1.1 Health Check

**Endpoint:** `GET /health`

**Description:** Returns comprehensive health status of all service dependencies.

**Response (200 OK):**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "kafka": {
      "status": "up",
      "details": "Connected to localhost:9092"
    },
    "redis": {
      "status": "up",
      "details": "Connected to redis://localhost:6379"
    },
    "livekit": {
      "status": "up"
    }
  }
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "unhealthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "kafka": {
      "status": "down",
      "details": "Kafka connection failed: connect ECONNREFUSED"
    },
    "redis": {
      "status": "up"
    },
    "livekit": {
      "status": "up"
    }
  }
}
```

---

### 1.2 Readiness Check

**Endpoint:** `GET /health/ready`

**Description:** Simple readiness check. Returns 200 only if all critical services are operational.

**Response (200 OK - Ready):**

```json
{
  "ready": true,
  "message": "All systems operational"
}
```

**Response (503 Not Ready):**

```json
{
  "ready": false,
  "message": "Some systems are unavailable"
}
```

---

## 2. Service Info Endpoints

### 2.1 Get Service Info

**Endpoint:** `GET /api`

**Description:** Returns basic information about the service.

**Response (200 OK):**

```json
{
  "name": "realtime-media-backend",
  "version": "1.0.0",
  "description": "WebRTC signaling, SFU integration, and real-time media session management",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## 3. WebSocket Signaling API

### Connection

**Endpoint:** `ws://localhost:3001`

**Authentication:**

```javascript
const socket = io("http://localhost:3001", {
  auth: {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  },
});
```

**Headers:**

- Authorization: Bearer {JWT_TOKEN}
- Content-Type: application/json

---

### 3.1 Join Room

**Event:** `join-room`

**Client Emits:**

```javascript
socket.emit("join-room", {
  token: "livekit-token",
  roomName: "presentation-session-123",
  participantIdentity: "user-456",
});
```

**Request Schema:**

```typescript
interface JoinRoomRequest {
  token: string; // LiveKit access token
  roomName: string; // Unique room identifier
  participantIdentity: string; // Participant ID
}
```

**Server Responses:**

Success - Token Event:

```javascript
socket.on("token", {
  token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
});
```

Participant Joined Event (broadcast to room):

```javascript
socket.on("participant-joined", {
  participantIdentity: "user-456",
});
```

Error Event:

```javascript
socket.on("error", "Authentication failed: Invalid token");
```

**Kafka Events Published:**

- Topic: `media.session.{sessionId}.participant.joined`
- Payload:

```json
{
  "participantIdentity": "user-456",
  "timestamp": "2024-01-15T10:30:00Z",
  "roomName": "presentation-session-123"
}
```

---

### 3.2 Leave Room

**Event:** `leave-room`

**Client Emits:**

```javascript
socket.emit("leave-room", {
  roomName: "presentation-session-123",
  participantIdentity: "user-456",
});
```

**Request Schema:**

```typescript
interface LeaveRoomRequest {
  roomName: string;
  participantIdentity: string;
}
```

**Server Responses:**

Participant Left Event (broadcast to room):

```javascript
socket.on("participant-left", {
  participantIdentity: "user-456",
});
```

**Kafka Events Published:**

- Topic: `media.session.{sessionId}.participant.left`
- Payload:

```json
{
  "participantIdentity": "user-456",
  "timestamp": "2024-01-15T10:30:00Z",
  "roomName": "presentation-session-123"
}
```

---

### 3.3 Send WebRTC Offer

**Event:** `offer`

**Client Emits:**

```javascript
socket.emit("offer", {
  to: "target-socket-id",
  offer: {
    type: "offer",
    sdp: "v=0\r\no=- 4611731400430051a...",
  },
});
```

**Request Schema:**

```typescript
interface OfferRequest {
  to: string; // Target recipient socket ID
  offer: {
    type: "offer";
    sdp: string; // SDP offer string
  };
}
```

**Server Response (routed to recipient):**

```javascript
socket.on("offer", {
  from: "sender-socket-id",
  offer: {
    type: "offer",
    sdp: "v=0\r\no=- 4611731400430051a...",
  },
});
```

---

### 3.4 Send WebRTC Answer

**Event:** `answer`

**Client Emits:**

```javascript
socket.emit("answer", {
  to: "target-socket-id",
  answer: {
    type: "answer",
    sdp: "v=0\r\no=- 4611731400430051b...",
  },
});
```

**Request Schema:**

```typescript
interface AnswerRequest {
  to: string; // Target recipient socket ID
  answer: {
    type: "answer";
    sdp: string; // SDP answer string
  };
}
```

**Server Response (routed to recipient):**

```javascript
socket.on("answer", {
  from: "sender-socket-id",
  answer: {
    type: "answer",
    sdp: "v=0\r\no=- 4611731400430051b...",
  },
});
```

---

### 3.5 Send ICE Candidate

**Event:** `ice-candidate`

**Client Emits:**

```javascript
socket.emit("ice-candidate", {
  to: "target-socket-id",
  candidate: {
    candidate:
      "candidate:842163049 1 udp 1677729535 192.168.1.100 54321 typ srflx raddr 192.168.1.100 rport 54321 generation 0 ufrag EsxB network-cost 999",
    sdpMLineIndex: 0,
    sdpMid: "video",
  },
});
```

**Request Schema:**

```typescript
interface IceCandidateRequest {
  to: string; // Target recipient socket ID
  candidate: {
    candidate: string; // ICE candidate string
    sdpMLineIndex: number;
    sdpMid?: string;
  };
}
```

**Server Response (routed to recipient):**

```javascript
socket.on("ice-candidate", {
  from: "sender-socket-id",
  candidate: {
    candidate: "candidate:842163049 1 udp 1677729535...",
    sdpMLineIndex: 0,
    sdpMid: "video",
  },
});
```

---

## 4. Kafka Topics

### Published Topics

#### 4.1 Participant Joined

```
Topic: media.session.{sessionId}.participant.joined
```

**Payload:**

```json
{
  "participantIdentity": "user-456",
  "roomName": "presentation-session-123",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### 4.2 Participant Left

```
Topic: media.session.{sessionId}.participant.left
```

**Payload:**

```json
{
  "participantIdentity": "user-456",
  "roomName": "presentation-session-123",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### 4.3 Audio Chunk (Phase 2.1)

```
Topic: media.session.{sessionId}.audio.chunk
```

**Payload (to be implemented):**

```json
{
  "speakerId": "user-456",
  "sequence": 1,
  "timestamp": "2024-01-15T10:30:00Z",
  "audioData": "base64-encoded-audio",
  "encoding": "opus",
  "sampleRate": 16000
}
```

#### 4.4 Video Frame (Phase 3.1)

```
Topic: media.session.{sessionId}.video.frame
```

**Payload (to be implemented):**

```json
{
  "speakerId": "user-456",
  "frameNumber": 150,
  "timestamp": "2024-01-15T10:30:00Z",
  "frameData": "base64-encoded-frame",
  "encoding": "h264",
  "width": 1920,
  "height": 1080
}
```

### Consumed Topics

#### 4.5 Session Created

```
Topic: session.created
```

**Payload:**

```json
{
  "sessionId": "session-123",
  "initiatorId": "user-456",
  "mode": "virtual",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### 4.6 Session Ended

```
Topic: session.ended
```

**Payload:**

```json
{
  "sessionId": "session-123",
  "endReason": "completed",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## 5. Error Responses

### WebSocket Errors

**Authentication Error:**

```javascript
socket.on("error", "Authentication failed: Invalid token");
```

**Connection Error:**

```javascript
socket.on("error", "WebSocket connection failed");
```

### REST Errors

**400 Bad Request:**

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "roomName",
      "message": "roomName is required"
    }
  ]
}
```

**401 Unauthorized:**

```json
{
  "statusCode": 401,
  "message": "Invalid JWT token"
}
```

**503 Service Unavailable:**

```json
{
  "statusCode": 503,
  "message": "Service temporarily unavailable",
  "details": "Kafka connection failed"
}
```

---

## 6. Example Client Implementation

### JavaScript (Socket.IO)

```javascript
import io from "socket.io-client";
import jwt from "jsonwebtoken";

// Generate JWT token
const token = jwt.sign(
  {
    roomName: "session-123",
    participantIdentity: "user-456",
  },
  "your-super-secret-jwt-key-change-in-production",
  { expiresIn: "1h" },
);

// Connect to WebSocket
const socket = io("http://localhost:3001", {
  auth: { token },
});

// Connection handlers
socket.on("connect", () => {
  console.log("Connected to media server");

  // Join room
  socket.emit("join-room", {
    token: "livekit-token-here",
    roomName: "session-123",
    participantIdentity: "user-456",
  });
});

socket.on("token", ({ token }) => {
  console.log("Received LiveKit token:", token);
});

socket.on("participant-joined", ({ participantIdentity }) => {
  console.log("Participant joined:", participantIdentity);
});

socket.on("offer", ({ from, offer }) => {
  console.log("Received offer from:", from);
  // Handle WebRTC offer
});

socket.on("error", (message) => {
  console.error("Error:", message);
});

socket.on("disconnect", () => {
  console.log("Disconnected from media server");
});
```

---

## 7. Rate Limiting & Quotas

- No explicit rate limiting (to be implemented in Phase 5.2)
- Per-session: 1000 ICE candidates/minute
- Per-participant: Max 2 concurrent media sessions
- Kafka message max size: 1MB

---

## 8. Security Considerations

- All WebSocket connections require valid JWT token
- JWT secret must be configured in environment variables
- CORS enabled for local development (should be restricted in production)
- No HTTPS/TLS in development (configure in production)
- LiveKit API credentials must be kept secure (use environment variables)

---

## 9. Versioning

- Current Version: 1.0.0
- API Version: v1
- Breaking changes will increment major version

---

## 10. Support & Documentation

- Full Setup Guide: [SETUP_GUIDE.md](./SETUP_GUIDE.md)
- Task List: [TASKS.md](./TASKS.md)
- Implementation Guide: [realtime-media-backend-IMPLEMENTATION.md](./realtime-media-backend-IMPLEMENTATION.md)
- Swagger UI: http://localhost:3001/api/docs
