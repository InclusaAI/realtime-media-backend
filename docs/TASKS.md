# Realtime Media Backend - Task Breakdown

## 📋 Project Overview

**Purpose:** WebRTC ingest, signaling, and real-time media session management for the SYNAPGRID platform.

**Key Responsibilities:**

- WebRTC signaling (offer/answer/ICE candidate exchange)
- SFU (Selective Forwarding Unit) integration via LiveKit
- Media session lifecycle management (join/leave, reconnect)
- Audio/video publishing to Kafka for AI consumption
- Recording capture hooks for raw media

**Tech Stack:** NestJS (TypeScript), LiveKit, WebSockets, Kafka, Redis

---

## 🟡 PHASE 0: PROJECT SETUP & DOCUMENTATION (Foundation)

_Status: **PARTIALLY COMPLETE** - Core setup exists, documentation & deployment needed_

### PHASE 0.1 - Core Project Configuration

- [ ] **0.1.1** Create comprehensive `.env.example` file with all required variables
  - LiveKit API key, URL, secret
  - Kafka brokers
  - Redis connection string
  - JWT secret key
  - Service port configuration
  - **Issues to address:** `kafka.config.ts` uses `process.env.KAFKA_BROKERS` which will crash if not set
  - **Issues to address:** `join-room.guard.ts` uses hardcoded secret `"your-secret-key"` - move to env var

- [ ] **0.1.2** Setup environment variables in `.env` file and load through ConfigModule
  - Replace hardcoded values in guards and configs
  - Implement validation for required env vars using class-validator

- [ ] **0.1.3** Setup NestJS `@nestjs/swagger` for API documentation
  - Install: `npm install @nestjs/swagger swagger-ui-express`
  - Add SwaggerModule to `main.ts`
  - Configure with project metadata
  - **This enables Swagger UI at `/api/docs`**

- [ ] **0.1.4** Add health check endpoints using `@nestjs/terminus`
  - Install: `npm install @nestjs/terminus`
  - Create `/health` endpoint
  - Check Kafka connectivity
  - Check Redis connectivity
  - Check LiveKit connectivity

---

## 🟡 PHASE 1: API ENDPOINT EXPOSURE & TESTING (MVP Critical)

_Status: **IN PROGRESS** - Signaling works, REST endpoints needed_

### PHASE 1.1 - REST API Documentation & Endpoints

- [ ] **1.1.1** Create REST controller for session management endpoints
  - `POST /api/sessions` - Create media session
  - `GET /api/sessions/:sessionId` - Get session details/status
  - `DELETE /api/sessions/:sessionId` - End session
  - `GET /api/sessions/:sessionId/participants` - List participants
  - `GET /api/sessions/:sessionId/metrics` - Connection quality metrics

- [ ] **1.1.2** Expose Swagger/OpenAPI documentation
  - Add `@ApiOperation()`, `@ApiResponse()` decorators to all endpoints
  - Document request/response schemas
  - Expose at `http://localhost:3001/api/docs`

- [ ] **1.1.3** Create DTOs for request/response validation
  - `CreateSessionDto` with sessionId, initiatorId, mode (physical/virtual/hybrid)
  - `JoinRoomDto` with token, roomName, participantIdentity
  - `MediaMetricsDto` with packet loss, jitter, RTT, bitrate
  - `SessionStatusDto` with participants, state, createdAt, metrics

### PHASE 1.2 - WebSocket Signaling Exposure & Testing

- [ ] **1.2.1** Document WebSocket events in code and expose via custom endpoint
  - Create `GET /api/signaling/events` endpoint that returns event schema documentation
  - Document: `join-room`, `leave-room`, `offer`, `answer`, `ice-candidate`
  - Document: response events: `token`, `participant-joined`, `participant-left`, `offer`, `answer`, `ice-candidate`

- [ ] **1.2.2** Create WebSocket connection guide/documentation
  - Document connection URL: `ws://localhost:3001`
  - Document authentication flow (JWT token)
  - Include example client code

---

## 🔴 PHASE 2: CORE MEDIA PIPELINE (MVP - Speech Transcription Path)

_Status: **INCOMPLETE** - Foundation ready, implementation needed_

### PHASE 2.1 - Audio Capture & Publishing to Kafka

- [ ] **2.1.1** Implement proper Kafka producer for audio chunks
  - Setup KafkaModule with producer configuration
  - Create audio chunk schema matching AI services contract
  - Topic: `media.session.<sessionId>.audio.chunk`
  - Include: `speakerId`, `sequence`, `timestamp`, `audioData` (opus/PCM encoded)

- [ ] **2.1.2** Hook LiveKit egress to capture audio
  - Implement WebSocket egress endpoint for receiving audio from LiveKit
  - Parse audio chunks from LiveKit track
  - Enrich with metadata (speakerId, timestamp, sequence)
  - Publish to Kafka

- [ ] **2.1.3** Add audio metrics tracking
  - Track samples received
  - Track Kafka publish success/failure
  - Export metrics to Prometheus

- [ ] **2.1.4** Test audio pipeline end-to-end
  - Create test client that joins, publishes audio
  - Verify Kafka messages appear with correct schema
  - Verify timestamps and sequence numbers are correct

### PHASE 2.2 - Audio Tap Service Completion

- [ ] **2.2.1** Implement AudioTapAgent properly
  - Currently `AudioTapAgent` is instantiated but not defined
  - Should connect to LiveKit and capture participant tracks
  - Should handle multiple participants
  - Should gracefully handle reconnects

- [ ] **2.2.2** Implement error handling and logging
  - Add logging for audio tap start/stop
  - Handle connection failures gracefully
  - Retry logic for Kafka publish failures

---

## 🟢 PHASE 3: VIDEO FRAME SAMPLING (MVP - Sign Recognition Path, Can Trail Audio)

_Status: **INCOMPLETE** - Egress service empty_

### PHASE 3.1 - Video Frame Capture & Sampling

- [ ] **3.1.1** Implement video egress configuration
  - Setup WebSocket egress for video from LiveKit
  - Configure frame sampling at 15fps (per ADR-0007)
  - Create frame capture and encoding logic

- [ ] **3.1.2** Implement video frame publishing to Kafka
  - Topic: `media.session.<sessionId>.video.frame`
  - Include: `speakerId`, `timestamp`, `frameData` (JPEG/H264 encoded), `frameNumber`
  - Implement backpressure handling (don't overflow Kafka)

- [ ] **3.1.3** Implement EgressService properly
  - Currently empty - needs full implementation
  - Handle multiple video tracks from different participants
  - Support quality adaptation (adjust sampling rate based on bandwidth)

- [ ] **3.1.4** Add video metrics tracking
  - Track frames captured
  - Track sampling rate
  - Export to Prometheus

---

## 🟡 PHASE 4: SESSION LIFECYCLE & RECONNECTION (MVP Critical)

_Status: **PARTIAL** - Basic handlers exist, needs robustness_

### PHASE 4.1 - Session Lifecycle Management

- [ ] **4.1.1** Implement proper session lifecycle
  - SessionManager to track active sessions
  - Session state: `INITIALIZING` → `ACTIVE` → `ENDING` → `ENDED`
  - Handle participant roster management
  - Track session created/ended timestamps

- [ ] **4.1.2** Implement Kafka consumer for session events
  - Listen to `session.created` topic (from platform-backend)
  - Listen to `session.ended` topic (from platform-backend)
  - Provision/teardown media session accordingly
  - **Currently:** SessionController exists but doesn't do anything useful

- [ ] **4.1.3** Publish session state change events
  - Topic: `media.session.<sessionId>.participant.joined`
  - Topic: `media.session.<sessionId>.participant.left`
  - Include: timestamp, participantIdentity, roomName
  - **Currently:** Being published but needs validation

### PHASE 4.2 - Reconnection Handling (Non-negotiable for live events)

- [ ] **4.2.1** Implement reconnection grace period
  - Track participant disconnection time
  - Allow reconnect within 30-second window (configurable)
  - Restore participant state on reconnect
  - Notify other participants

- [ ] **4.2.2** Implement connection state tracking
  - Track connection quality metrics (RTT, packet loss, jitter)
  - Detect quality degradation
  - Implement adaptive quality (reduce video quality if needed)

- [ ] **4.2.3** Test reconnection scenarios
  - Network interruption recovery
  - Prolonged disconnect/reconnect
  - Multiple participant reconnects simultaneously

---

## 🔴 PHASE 5: ADVANCED FEATURES (Post-MVP)

\*Status: **NOT STARTED\***

### PHASE 5.1 - Recording Capture Hooks

- [ ] **5.1.1** Implement recording metadata publishing
  - Topic: `media.session.<sessionId>.recording.metadata`
  - Include: recordingId, sessionId, startTime, participants
  - **Note:** Actual recording assembly happens in `recording-service` (ADR-0006)

- [ ] **5.1.2** Hook into LiveKit recording APIs
  - Implement Egress for composite recording
  - Setup output to object storage (S3/GCS)
  - Track recording status

### PHASE 5.2 - Quality Metrics & Monitoring

- [ ] **5.2.1** Implement Prometheus metrics
  - Connection metrics: RTT, packet loss, jitter, bitrate
  - Session metrics: participant count, session duration
  - Kafka metrics: publish latency, failure rate
  - LiveKit metrics: track create/delete, egress status

- [ ] **5.2.2** Setup Prometheus scraping
  - Expose `/metrics` endpoint
  - Configure in docker-compose for local testing

### PHASE 5.3 - Graceful Shutdown & Cleanup

- [ ] **5.3.1** Implement graceful shutdown
  - Stop accepting new connections
  - Allow existing sessions 30s to complete
  - Close Kafka/Redis connections
  - Cleanup LiveKit resources

- [ ] **5.3.2** Implement pre-stop hooks for K8s
  - Drain connections
  - Wait for in-flight messages

### PHASE 5.4 - Load Testing

- [ ] **5.4.1** Create load test suite
  - Test with N concurrent sessions
  - Test with M participants per session
  - Measure latency, resource usage
  - Test Kafka throughput

- [ ] **5.4.2** Document scaling guidelines
  - Recommended pod replicas per load
  - Resource requests/limits
  - Network policies for media workloads

---

## 🟠 PHASE 6: DEPLOYMENT & INFRASTRUCTURE

\*Status: **NOT STARTED\***

### PHASE 6.1 - Docker & Kubernetes

- [ ] **6.1.1** Create production Dockerfile
  - Multi-stage build
  - Minimal image size
  - Health check included

- [ ] **6.1.2** Create Helm chart
  - StatelessSet deployment
  - ConfigMap for environment
  - Service and Ingress
  - Network policies for media traffic
  - Pod Disruption Budgets
  - Dedicated node pool (if needed)

### PHASE 6.2 - CI/CD Pipeline

- [ ] **6.2.1** Setup GitHub Actions workflow
  - Build Docker image
  - Run tests
  - Push to container registry
  - Deploy to staging/prod

### PHASE 6.3 - Observability

- [ ] **6.3.1** Setup logging
  - Structured logging (Winston/Pino)
  - Log correlation IDs
  - ELK/CloudLogging integration

- [ ] **6.3.2** Setup tracing
  - OpenTelemetry integration
  - Jaeger/Cloud Trace export
  - Trace key operations (join, publish, consume)

---

## 📊 PRIORITY MATRIX

### 🔴 CRITICAL (Blocking MVP Demo)

1. **Phase 1: API Exposure & Swagger** - Can't test without endpoints
2. **Phase 2.1: Audio Publishing to Kafka** - Unblocks AI services ASR work
3. **Phase 0.1: Environment Configuration** - Blocking deployment

### 🟡 HIGH (MVP Complete)

4. Phase 3.1: Video Frame Sampling - Unblocks sign recognition
5. Phase 4.1: Session Lifecycle - Production-grade session handling
6. Phase 4.2: Reconnection Handling - Non-negotiable for live events

### 🟢 MEDIUM (Production Ready)

7. Phase 5.1: Recording Hooks - Recording workflow
8. Phase 5.2: Metrics & Monitoring - Observability
9. Phase 6: Deployment & Infrastructure - Production ready

### 🔵 LOW (Polish/Optimization)

10. Phase 5.3: Graceful Shutdown
11. Phase 5.4: Load Testing
12. Phase 6.2-6.3: CI/CD and Advanced Observability

---

## ⚠️ KNOWN ISSUES & CORRECTIONS NEEDED

### IMMEDIATE FIXES REQUIRED

1. **Hardcoded JWT Secret** (`apps/media-control/join-room/join-room.guard.ts:13`)

   ```typescript
   // WRONG:
   const decoded = jwt.verify(data.token, "your-secret-key");
   // SHOULD BE:
   const decoded = jwt.verify(data.token, this.configService.get("JWT_SECRET"));
   ```

   **Fix:** Use `ConfigService` to load from env var

2. **Kafka Brokers Configuration** (`apps/media-control/src/config/kafka.config.ts`)

   ```typescript
   brokers: process.env.KAFKA_BROKERS.split(",");
   // Will crash if KAFKA_BROKERS is undefined
   ```

   **Fix:** Add validation and default value

3. **Missing AudioTapAgent Implementation**
   - File doesn't exist or is incomplete
   - Being instantiated in `AudioTapService` but never properly defined
   - **Fix:** Create proper implementation or remove usage

4. **Empty EgressService**
   - `apps/media-control/src/egress/egress.service.ts` is a stub
   - Needs full video egress implementation
   - **Fix:** Implement video frame capture and publishing

5. **Basic SessionController**
   - Doesn't do anything with `session.created/ended` events
   - Should validate Kafka message signatures if needed
   - **Fix:** Implement proper event handling (or remove if not needed)

6. **Missing Kafka Consumer Setup**
   - No consumer for session lifecycle events
   - No consumer for accessibility preferences
   - **Fix:** Add Kafka consumers for cross-service communication

7. **No Error Handling**
   - WebSocket handlers don't handle errors gracefully
   - No try-catch or error logging
   - **Fix:** Add comprehensive error handling

8. **No Input Validation**
   - WebSocket message handlers don't validate input
   - Could accept malformed offers/answers
   - **Fix:** Add ZodType or class-validator

9. **Hardcoded Room Name in Audio Tap**
   - `SignalingGateway` calls `this.audioTapService.startAudioTap(roomName)` on every join
   - Multiple joins might cause issues
   - **Fix:** Add room-to-tap mapping with cleanup

10. **Missing LiveKit Configuration**
    - `livekitConfig` is imported but not reviewed
    - Need to verify API key/secret/URL setup
    - **Fix:** Verify config and add to `.env.example`

11. **No Graceful Shutdown**
    - Service won't properly close connections on termination
    - LiveKit/Kafka/Redis may not cleanup
    - **Fix:** Implement `onModuleDestroy` in services

12. **Type Safety Issues**
    - `(client as any).user` casting in signaling gateway
    - `TrackInfo: any` in SFU adapter
    - **Fix:** Create proper types for WebSocket data

---

## 📈 SUCCESS METRICS

- [ ] All 3 local services (LiveKit, Kafka, Redis) running via docker-compose
- [ ] API docs available at `http://localhost:3001/api/docs` (Swagger)
- [ ] Health check endpoint returns 200 with all services healthy
- [ ] WebSocket connection and signaling working (test via Postman/CLI)
- [ ] Audio chunks being published to Kafka with correct schema
- [ ] Video frames being sampled at 15fps and published to Kafka
- [ ] Session lifecycle events flowing properly (created → joined → left → ended)
- [ ] Reconnection within 30s restores participant state
- [ ] Prometheus metrics exposed at `/metrics`
- [ ] Graceful shutdown completes within 30s
- [ ] Load test: 50 concurrent sessions, 100 participants total, <200ms audio latency

---

## 🔗 Related Documentation

- Implementation Guide: `realtime-media-backend-IMPLEMENTATION.md`
- Architecture Decisions: `inclusaai-docs/docs/adr/ADR-0001.md` (LiveKit), `ADR-0006.md` (Recording), `ADR-0007.md` (Video sampling)
- Platform Overview: `platform-architecture.md` (if exists)

---

## 📝 Notes for Session

- You can pick tasks in any order within phases
- Complete Phase 0 before Phase 1
- Phases 2 and 3 can be done in parallel (different teams)
- Use this file to track progress (update status as you complete tasks)
