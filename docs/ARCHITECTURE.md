# Architecture & Data Flows

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                                    │
│  ┌──────────────────┐      ┌──────────────────┐                     │
│  │  Web Client      │      │  Mobile Client   │                     │
│  │  (Browser/JS)    │      │  (iOS/Android)   │                     │
│  └────────┬─────────┘      └────────┬─────────┘                     │
└───────────┼──────────────────────────┼────────────────────────────────┘
            │ WebSocket                │ WebSocket
            │ Signaling Events         │ Signaling Events
            │                          │
┌───────────▼──────────────────────────▼────────────────────────────────┐
│                    REALTIME MEDIA BACKEND (This Service)              │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ SIGNALING GATEWAY (WebSocket)                                  │   │
│  │  Events: join-room, leave-room, offer, answer, ice-candidate │   │
│  └────────────┬──────────────────────────────────────────────────┘   │
│               │                                                        │
│  ┌────────────▼──────────────────────────────────────────────────┐   │
│  │ SESSION MANAGER (Tracks participants & state)                 │   │
│  │  ├─ Session State Machine                                     │   │
│  │  ├─ Participant Roster                                        │   │
│  │  └─ Connection Quality Tracking                               │   │
│  └────────────┬───────────────────────┬──────────────────────────┘   │
│               │                       │                               │
│  ┌────────────▼──────────────┐  ┌────▼──────────────────────────┐   │
│  │ SFU ADAPTER                │  │ KAFKA PUBLISHERS              │   │
│  │ (LiveKit Client)           │  │                               │   │
│  │  ├─ Join/Leave Tokens      │  │ Participant Events:           │   │
│  │  ├─ Room State             │  │  ├─ participant.joined        │   │
│  │  └─ Track Management       │  │  └─ participant.left          │   │
│  │                            │  │                               │   │
│  │ [Future Extensibility]     │  │ Media Streams:                │   │
│  │ Can swap to mediasoup      │  │  ├─ audio.chunk              │   │
│  │                            │  │  └─ video.frame              │   │
│  └────────────┬───────────────┘  └────┬──────────────────────────┘   │
│               │                       │                               │
│               │ Media Tracks          │ Kafka Messages               │
└───────────────┼───────────────────────┼───────────────────────────────┘
                │                       │
┌───────────────▼───────────────────────▼───────────────────────────────┐
│                        INFRASTRUCTURE LAYER                           │
│                                                                        │
│  ┌─────────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ LiveKit SFU         │  │ Kafka Message    │  │ Redis Cache    │  │
│  │ (Port 7880)         │  │ Broker           │  │ (Port 6379)    │  │
│  │                     │  │ (Port 9092)      │  │                │  │
│  │ ├─ Media Forwarding │  │ ├─ Participant   │  │ ├─ Sessions    │  │
│  │ ├─ Room State       │  │ │   Events       │  │ ├─ Tracks      │  │
│  │ ├─ Track Egress     │  │ ├─ Audio Chunks  │  │ └─ State       │  │
│  │ └─ Recording API    │  │ └─ Video Frames  │  └────────────────┘  │
│  └─────────────────────┘  └────────┬─────────┘                       │
│                                     │                                 │
└─────────────────────────────────────┼─────────────────────────────────┘
                                      │
┌─────────────────────────────────────▼─────────────────────────────────┐
│                       AI SERVICES LAYER                               │
│                                                                        │
│  ┌───────────────────────┐  ┌────────────────────┐                   │
│  │ ASR Service           │  │ Sign Recognition   │                   │
│  │ (Speech-to-Text)      │  │ (Vision Models)    │                   │
│  │                       │  │                    │                   │
│  │ Consumes:             │  │ Consumes:          │                   │
│  │ audio.chunk           │  │ video.frame (15fps)│                   │
│  │                       │  │                    │                   │
│  │ Produces:             │  │ Produces:          │                   │
│  │ transcript.segment    │  │ pose.frame         │                   │
│  └───────────────────────┘  └────────────────────┘                   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Flow: Join Session

```
Client                  Signaling Gateway         LiveKit              Kafka
  │                           │                     │                    │
  ├─ WebSocket Connect ──────>│                     │                    │
  │                           │                     │                    │
  ├─ emit('join-room') ──────>│                     │                    │
  │  {token, room, identity}  │                     │                    │
  │                           │                     │                    │
  │                           ├─ Validate JWT ◄─────┤ Check              │
  │                           │                     │                    │
  │                           ├─ Generate Token ───>│ AccessToken        │
  │                           │                     │ (LiveKit SDK)      │
  │                           │<─ Return Token ─────┤                    │
  │                           │                     │                    │
  │<─ emit('token') ───────────                     │                    │
  │  {livekit_token}          │                     │                    │
  │                           │                     │                    │
  │                           ├───────────────────────────────────────>  │
  │                           │ Emit Event: participant.joined            │
  │                           │                                           │
  │<─ broadcast('participant-joined') ─────────────────────────────────  │
  │   {participantIdentity}   │                     │                    │
  │                           │                     │                    │
  │ (Client connects to       │                     │                    │
  │  LiveKit with token)      │                     │                    │
  │                           │                     │                    │
  │                           │ Start AudioTap ────>│ Begin capturing    │
  │                           │                     │ tracks             │
  │                           │                     │                    │
```

---

## 📊 Data Flow: Media Publishing (Future - Phase 2 & 3)

```
LiveKit                 Audio/Video Tap          Kafka Producer       Kafka Topics
  │                           │                      │                    │
  ├─ Participant Joins        │                      │                    │
  │  (Publishes Audio)        │                      │                    │
  │                           │                      │                    │
  ├─ Audio Track Events ─────>│                      │                    │
  │  (PCM/Opus frames)        │                      │                    │
  │                           │                      │                    │
  │                           ├─ Sample/Encode ─────>│ Create Message     │
  │                           │  at 16kHz, Opus      │ {speakerId,        │
  │                           │                      │  sequence,         │
  │                           │                      │  timestamp,        │
  │                           │                      │  audioData}        │
  │                           │                      │                    │
  │                           │                      ├─ Publish ─────────>│
  │                           │                      │ media.session.    │
  │                           │                      │ {id}.audio.chunk  │
  │                           │                      │                    │
  │                           │                      │                    │
  ├─ Video Track Events ─────>│ (Phase 3)            │                    │
  │  (30fps H.264)            │                      │                    │
  │                           │                      │                    │
  │                           ├─ Sample at 15fps ───>│ Create Message     │
  │                           │  (Skip frames)       │ {speakerId,        │
  │                           │  Encode JPEG         │  frameNumber,      │
  │                           │                      │  timestamp,        │
  │                           │                      │  frameData}        │
  │                           │                      │                    │
  │                           │                      ├─ Publish ─────────>│
  │                           │                      │ media.session.    │
  │                           │                      │ {id}.video.frame  │
  │                           │                      │                    │
```

---

## 📊 Data Flow: Leave Session

```
Client                  Signaling Gateway         LiveKit              Kafka
  │                           │                     │                    │
  ├─ emit('leave-room') ─────>│                     │                    │
  │  {roomName, identity}     │                     │                    │
  │                           │                     │                    │
  │                           ├─ Remove Participant─>│                    │
  │                           │                     │                    │
  │                           │                     ├─ Cleanup Tracks   │
  │                           │                     │ Stop Recording    │
  │                           │                     │                    │
  │                           │                     │<─ Confirm         │
  │                           │<─ Return ───────────┤                    │
  │                           │                     │                    │
  │                           ├───────────────────────────────────────>  │
  │                           │ Emit Event: participant.left              │
  │                           │                                           │
  │<─ broadcast('participant-left') ──────────────────────────────────  │
  │   {participantIdentity}   │                     │                    │
  │                           │                     │                    │
  │<─ disconnect ─────────────│                     │                    │
  │ (closes connection)       │                     │                    │
  │                           │                     │                    │
```

---

## 🔄 Reconnection Flow (Phase 4.2)

```
Client                  Signaling Gateway         Session State
  │                           │                     │
  │ (Network Interruption)    │                     │
  │                           │                     │
  ├─ disconnect ─────────────>│                     │
  │                           │ Record Disconnect   │
  │                           ├────────────────────>│ Time: T0
  │                           │                     │ State: DISCONNECTED
  │                           │                     │
  │ (User reconnects)         │                     │
  │                           │                     │
  ├─ WebSocket Connect ──────>│ Check Grace Period  │
  │                           ├────────────────────>│ T-T0 < 30s? YES
  │                           │                     │
  ├─ emit('join-room') ──────>│ Restore State ◄────│ Same identity
  │                           │ Same tracks         │ Same permissions
  │                           │                     │
  │<─ emit('token') ───────────                    │
  │  {new_livekit_token}      │                     │
  │                           │                     │
  │<─ broadcast('participant-rejoined') ────────  │
  │                           │                     │
  │ ✅ Session Restored       │                     │
  │                           │                     │
  │                           │                     │
  │ (If Grace Period Expired) │                     │
  │                           │                     │
  ├─ WebSocket Connect ──────>│ Grace Period Expired│
  │                           ├────────────────────>│
  │                           │ Create New Session  │
  │                           │                     │
  ├─ emit('join-room') ──────>│ New identity        │
  │                           │ New permissions     │
  │                           │                     │
  │<─ emit('token') ───────────                    │
  │                           │                     │
  │<─ broadcast('participant-joined') ────────    │
  │                           │                     │
  │ ℹ️ New Session Created    │                     │
  │                           │                     │
```

---

## 📋 Kafka Topic Schema

### Participant Events

```json
// Topic: media.session.{sessionId}.participant.joined
{
  "participantIdentity": "user-456",
  "roomName": "presentation-123",
  "timestamp": "2024-01-15T10:30:00Z",
  "metadata": {
    "mode": "virtual",
    "deviceInfo": {}
  }
}

// Topic: media.session.{sessionId}.participant.left
{
  "participantIdentity": "user-456",
  "roomName": "presentation-123",
  "timestamp": "2024-01-15T10:35:00Z",
  "duration": 300,
  "reason": "user-initiated"
}
```

### Audio Chunks (Future)

```json
// Topic: media.session.{sessionId}.audio.chunk
{
  "speakerId": "user-456",
  "sequence": 1,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "audioData": "base64-encoded-opus-frame",
  "encoding": "opus",
  "sampleRate": 16000,
  "channels": 1,
  "duration": 20
}
```

### Video Frames (Future)

```json
// Topic: media.session.{sessionId}.video.frame
{
  "speakerId": "user-456",
  "frameNumber": 150,
  "timestamp": "2024-01-15T10:30:06.667Z",
  "frameData": "base64-encoded-jpeg",
  "encoding": "jpeg",
  "width": 1920,
  "height": 1080,
  "quality": 85
}
```

---

## 🔐 Security Flows

### JWT Token Validation

```
Client Request
  ├─ Send JWT in Auth header
  │  or as query parameter
  │
WebSocket Gateway
  ├─ Extract JWT from auth
  │
  ├─ Verify Signature
  │  Using JWT_SECRET from env
  │
  ├─ Check Expiration
  │  exp claim vs current time
  │
  ├─ Extract Claims
  │  roomName, participantIdentity
  │
  └─ If Valid → Allow Connection
    └─ If Invalid → Send Error Event
```

### LiveKit Token Generation

```
Gateway
  ├─ Receive join-room request
  │  with validated JWT claims
  │
  ├─ Create AccessToken
  │  Using LiveKit SDK
  │
  ├─ Set Grant
  │  roomJoin: true
  │  room: {roomName}
  │  canPublish: true
  │  canSubscribe: true
  │
  ├─ Sign with LiveKit Secret
  │  LIVEKIT_API_SECRET
  │
  └─ Return JWT to Client
    └─ Client uses for LiveKit WS
```

---

## 📈 Scaling Architecture

```
Single Pod (Current):
┌────────────────────────────────┐
│ Realtime Media Backend         │
│ (1 Pod, 2GB RAM, 2 CPU)        │
│                                │
│ Max: 50 concurrent sessions    │
│ Max: 500 participants total    │
└────────────────────────────────┘

Multiple Pods (Future):
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Pod 1           │  │ Pod 2           │  │ Pod N           │
│ 50 sessions     │  │ 50 sessions     │  │ 50 sessions     │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                      ┌────────▼────────┐
                      │ Shared Services │
                      ├─ Kafka (Broker)│
                      ├─ Redis (Cache) │
                      ├─ LiveKit (SFU) │
                      └─────────────────┘
```

---

## 🎯 Critical Paths

### Highest Latency Path (to optimize)

```
Client Audio Input
  ↓ (10ms)
LiveKit Track
  ↓ (5ms)
Audio Tap Service
  ↓ (10ms)
Kafka Producer
  ↓ (20ms)
Kafka Topic
  ↓ (5ms)
AI Services (ASR)
  ↓ (500-2000ms) ← Speech recognition
Transcript Output

Total: ~550-2050ms latency acceptable for async transcription
```

### Lowest Latency Path (critical)

```
Client Offer/Answer
  ↓ (2ms)
WebSocket Gateway
  ↓ (1ms)
Route to Recipient
  ↓ (2ms)
Recipient Receives Answer

Total: ~5ms ← Must be <50ms
```

---

## 🔄 State Transitions

### Session State Machine

```
IDLE
  ↓ (session.created event)
INITIALIZING
  ↓ (first participant joins)
ACTIVE ←─────────┐
  │              │
  ├─ Participant │ (participant rejoin within grace period)
  │ Reconnects   │
  │ (Join) ──────┘
  │
  ├─ Last Participant Leaves
  ↓
ENDING
  ↓ (session.ended event)
ENDED
```

### Participant State Machine

```
IDLE
  ↓ (join-room event)
JOINING
  ↓ (LiveKit token received)
ACTIVE
  ├─ Can Publish Audio/Video
  ├─ Can Receive Offers
  └─ Can Send ICE Candidates
  │
  ├─ Network Interruption
  ↓
DISCONNECTED (Grace Period 30s)
  ├─ Rejoins within 30s → Back to ACTIVE
  └─ Timeout → Cleaned up
  │
  ├─ leave-room event
  ↓
LEAVING
  ↓ (tracks stopped)
LEFT
```

---

## 📊 Resource Allocation

### Memory

- Base: ~200MB (NestJS app)
- Per Session: ~5MB (roster, state, connections)
- Per Participant: ~2MB (track state)
- Per 50 Sessions: ~450MB (optimal utilization)

### CPU

- Idle: ~5% (background tasks)
- Per Signaling Event: ~1% spike
- Per Session: ~2% baseline
- Per 50 Sessions: ~100% (at threshold)

### Network

- Participant Join: ~2KB
- Per Audio Chunk: ~50KB
- Per Video Frame: ~100KB
- Kafka Throughput: ~5Mbps per 50 sessions

### Connections

- WebSocket: 1 per participant
- LiveKit: 1 per participant
- Kafka: 1 connection pool
- Redis: 1 connection pool

---

_Architecture Diagram v1.0_  
_Last Updated: 2024-01-15_
