import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

/**
 * REST endpoint that documents the Kafka events consumed/published
 * by this service. Since Kafka consumers don't appear in Swagger,
 * this controller provides documentation for the event-driven interfaces.
 */
@ApiTags("Sessions")
@Controller("api/sessions/events")
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
            "Triggers cleanup of audio taps, egress sessions, and all room resources.",
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
            "Published by SignalingGateway when a participant joins a room via WebSocket.",
          destination: "all consumers",
          payload: {
            participantIdentity: "string",
            roomName: "string",
            timestamp: "string — ISO 8601",
          },
        },
        "media.session.{roomName}.participant.left": {
          description:
            "Published by SignalingGateway when a participant leaves a room via WebSocket.",
          destination: "all consumers",
          payload: {
            participantIdentity: "string",
            roomName: "string",
            timestamp: "string — ISO 8601",
          },
        },
        "media.session.{roomName}.audio.chunk": {
          description:
            "Published by AudioChunkHandler when raw audio frames are received from LiveKit Egress.",
          destination: "AI services (ASR)",
          payload: {
            speakerId: "string",
            sequence: "number",
            timestamp: "string — ISO 8601",
            audioData: "string — base64-encoded Opus",
            encoding: "string — 'opus'",
            sampleRate: "number — 48000",
            channels: "number — 1",
            trackSid: "string",
            roomName: "string",
          },
        },
        "media.session.{roomName}.audio.metadata": {
          description:
            "Published by AudioTapAgent when audio tracks are subscribed/unsubscribed.",
          destination: "all consumers",
          payload: {
            event: "string — 'track_subscribed' | 'track_unsubscribed'",
            speakerId: "string",
            trackSid: "string",
            sequence: "number",
            timestamp: "string — ISO 8601",
            roomName: "string",
          },
        },
      },
    };
  }
}
