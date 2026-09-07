import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

/**
 * REST endpoint that documents the Kafka events consumed/published
 * by this service. Since Kafka consumers don't appear in Swagger,
 * this controller provides documentation for the event-driven interfaces.
 */
@ApiTags("Sessions")
@Controller("api/kafka-events")
export class KafkaEventsDocsController {
  @Get()
  @ApiOperation({
    summary: "Get Kafka event documentation",
    description:
      "Documents all Kafka topics consumed and published by this service. " +
      "This service acts as both a producer and consumer for session lifecycle events.",
  })
  @ApiResponse({
    status: 200,
    description: "Returns the Kafka events schema.",
  })
  getKafkaEvents() {
    return {
      consumed: {
        "session.created": {
          description:
            "Listened for by SessionEventController. " +
            "Triggers pre-warming of media resources when a new session is created by the platform backend.",
          source: "platform-backend",
          payload: {
            sessionId: "string — unique session identifier",
            roomName: "string — LiveKit room name",
            initiatorId: "string — user who created the session",
            mode: "string — 'physical' | 'virtual' | 'hybrid'",
            timestamp: "string — ISO 8601",
          },
          example: {
            sessionId: "session_abc123",
            roomName: "session_abc123",
            initiatorId: "user-initiator-123",
            mode: "hybrid",
            timestamp: "2025-01-15T10:30:00.000Z",
          },
        },
        "session.ended": {
          description:
            "Listened for by SessionEventController. " +
            "Triggers cleanup of audio taps, video egress, and all room resources.",
          source: "platform-backend",
          payload: {
            roomName: "string — LiveKit room name",
            sessionId: "string — optional session identifier",
          },
          example: {
            roomName: "session_abc123",
            sessionId: "session_abc123",
          },
        },
      },
      published: {
        "session.created": {
          description:
            "Published by SessionsService when a new session is created via REST API.",
          destination: "all consumers",
          payload: {
            sessionId: "string",
            roomName: "string",
            initiatorId: "string",
            mode: "string",
            timestamp: "string — ISO 8601",
          },
        },
        "session.ended": {
          description:
            "Published by SessionsService when a session is ended via REST API.",
          destination: "all consumers",
          payload: {
            sessionId: "string",
            roomName: "string",
            timestamp: "string — ISO 8601",
            durationMs: "number — session duration in milliseconds",
          },
        },
        "media.session.{roomName}.participant.joined": {
          description:
            "Published by SignalingGateway when a participant joins a room via WebSocket. " +
            "Matches inclusaai_contracts ParticipantEvent schema.",
          destination: "AI services (engagement)",
          payload: {
            session_id: "string — LiveKit room name (1:1 with session ID)",
            participant_id: "string — participant identity",
            event: "string — 'joined'",
            timestamp_ms: "number — epoch milliseconds",
          },
        },
        "media.session.{roomName}.participant.left": {
          description:
            "Published by SignalingGateway when a participant explicitly leaves, or by SessionsService " +
            "when a reconnection grace period expires. Matches inclusaai_contracts ParticipantEvent schema.",
          destination: "AI services (engagement)",
          payload: {
            session_id: "string — LiveKit room name (1:1 with session ID)",
            participant_id: "string — participant identity",
            event: "string — 'left'",
            timestamp_ms: "number — epoch milliseconds",
          },
        },
        "media.session.{roomName}.audio.chunk": {
          description:
            "Published by AudioChunkHandler when raw audio frames are received from LiveKit Egress. " +
            "Matches inclusaai_contracts AudioChunk schema.",
          destination: "AI services (ASR)",
          payload: {
            session_id: "string — LiveKit room name (1:1 with session ID)",
            speaker_id: "string — participant identity",
            sequence: "number — monotonically increasing per track",
            timestamp_ms: "number — epoch milliseconds",
            sample_rate: "number — 16000",
            encoding: "string — 'opus'",
            payload_b64: "string — base64-encoded audio bytes",
          },
        },
        "media.session.{roomName}.audio.metadata": {
          description:
            "Published by MediaTapAgent when audio tracks are subscribed/unsubscribed. Internal topic.",
          destination: "internal",
          payload: {
            event: "string — 'track_subscribed' | 'track_unsubscribed'",
            speaker_id: "string",
            track_sid: "string",
            kind: "string — 'audio'",
            sequence: "number",
            timestamp_ms: "number — epoch milliseconds",
            session_id: "string",
          },
        },
        "media.session.{roomName}.video.frame": {
          description:
            "Published by VideoFrameHandler when video frames are received from LiveKit Egress. " +
            "Frames are sampled at 15fps (66.67ms interval) with automatic frame dropping. " +
            "Matches inclusaai_contracts VideoFrame schema.",
          destination: "AI services (sign recognition, vision quality)",
          payload: {
            session_id: "string — LiveKit room name (1:1 with session ID)",
            presenter_id: "string — participant identity",
            sequence: "number — monotonically increasing per track",
            timestamp_ms: "number — epoch milliseconds",
            width: "number — frame width (0 if not parsed)",
            height: "number — frame height (0 if not parsed)",
            fps: "number — target FPS (15 per ADR-0007)",
            payload_b64: "string — base64-encoded video frame",
          },
          example: {
            session_id: "my-room",
            presenter_id: "user-123",
            sequence: 150,
            timestamp_ms: 1705315800000,
            width: 1280,
            height: 720,
            fps: 15,
            payload_b64: "AAAAIG...",
          },
          sampling: {
            targetFps: 15,
            intervalMs: 66.67,
            behavior:
              "Frames arriving faster than 66.67ms are dropped to maintain target FPS.",
          },
        },
        "media.session.{roomName}.video.metadata": {
          description:
            "Published by MediaTapAgent when video tracks are subscribed/unsubscribed. Internal topic.",
          destination: "internal",
          payload: {
            event: "string — 'track_subscribed' | 'track_unsubscribed'",
            speaker_id: "string",
            track_sid: "string",
            kind: "string — 'video'",
            sequence: "number",
            timestamp_ms: "number — epoch milliseconds",
            session_id: "string",
          },
        },
      },
    };
  }
}
