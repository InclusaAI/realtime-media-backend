import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

/**
 * REST endpoint that documents the Egress WebSocket protocol.
 * Since WebSocket gateways don't appear in Swagger, this controller
 * provides documentation for the /egress WebSocket namespace.
 */
@ApiTags("Egress")
@Controller("api/egress")
export class EgressDocsController {
  @Get("events")
  @ApiOperation({
    summary: "Get Egress WebSocket event documentation",
    description:
      "Documents the /egress WebSocket namespace used by LiveKit Egress " +
      "to stream raw audio/video data to this service. " +
      "LiveKit connects as a client to this WebSocket endpoint.",
  })
  @ApiResponse({
    status: 200,
    description: "Returns the Egress WebSocket protocol schema.",
  })
  getEgressEvents() {
    return {
      namespace: "/egress",
      description:
        "WebSocket endpoint that receives raw media data from LiveKit Egress. " +
        "LiveKit connects as a client with query parameters identifying the track. " +
        "Supports both audio and video tracks with automatic FPS sampling for video.",
      connection: {
        url: "ws://localhost:3001/egress",
        queryParams: {
          roomName: "string — LiveKit room name",
          trackSid: "string — Track SID to receive data for",
          kind: "string — 'audio' or 'video' (default: 'audio')",
          participantIdentity:
            "string — optional, the participant who owns this track",
        },
        example:
          "ws://localhost:3001/egress?roomName=my-room&trackSid=TR_ABC123&kind=video&participantIdentity=user-123",
      },
      "client-to-server": {
        audio: {
          description:
            "Binary audio frame from LiveKit Egress. " +
            "First 4 bytes: payload size (big-endian uint32), followed by Opus-encoded audio payload.",
          format: "binary",
        },
        video: {
          description:
            "Binary video frame from LiveKit Egress. " +
            "First 4 bytes: payload size (big-endian uint32), followed by H264/VP8/VP9-encoded video payload. " +
            "Frames are sampled at 15fps (66.67ms interval). Frames arriving faster are dropped.",
          format: "binary",
          samplingRate: "15 fps (configurable)",
          interval: "66.67ms between published frames",
        },
        raw_binary: {
          description:
            "Alternative: raw binary frame without event name. " +
            "Handled based on the track kind (audio or video).",
          format: "binary",
        },
      },
      "server-to-client": {
        error: {
          description: "Error message if processing fails.",
          payload: {
            message: "string",
          },
        },
      },
      audioChunkSchema: {
        topic: "media.session.{roomName}.audio.chunk",
        description: "Kafka topic where processed audio chunks are published.",
        schema: {
          speakerId: "string — participant identity",
          sequence: "number — monotonically increasing sequence per track",
          timestamp: "string — ISO 8601 timestamp",
          audioData: "string — base64-encoded Opus audio payload",
          encoding: "string — 'opus'",
          sampleRate: "number — 48000",
          channels: "number — 1 (mono)",
          trackSid: "string — LiveKit track SID",
          roomName: "string — LiveKit room name",
        },
        example: {
          speakerId: "user-123",
          sequence: 42,
          timestamp: "2025-01-15T10:30:00.000Z",
          audioData: "UklGRi...",
          encoding: "opus",
          sampleRate: 48000,
          channels: 1,
          trackSid: "TR_ABC123",
          roomName: "my-room",
        },
      },
      videoFrameSchema: {
        topic: "media.session.{roomName}.video.frame",
        description:
          "Kafka topic where sampled video frames are published. " +
          "Frames are sampled at 15fps from the raw LiveKit egress stream.",
        schema: {
          speakerId: "string — participant identity",
          sequence: "number — monotonically increasing sequence per track",
          timestamp: "string — ISO 8601 timestamp",
          frameData: "string — base64-encoded video payload (H264/VP8/VP9)",
          codec: "string — detected codec: 'h264', 'vp8', 'vp9', or 'unknown'",
          width: "number — frame width (0 if not parsed)",
          height: "number — frame height (0 if not parsed)",
          frameNumber: "number — same as sequence (alias for AI services)",
          trackSid: "string — LiveKit track SID",
          roomName: "string — LiveKit room name",
        },
        example: {
          speakerId: "user-123",
          sequence: 150,
          timestamp: "2025-01-15T10:30:00.000Z",
          frameData: "AAAAIG...",
          codec: "h264",
          width: 1280,
          height: 720,
          frameNumber: 150,
          trackSid: "TR_DEF456",
          roomName: "my-room",
        },
        sampling: {
          targetFps: 15,
          intervalMs: 66.67,
          behavior:
            "Frames arriving faster than 66.67ms are dropped. " +
            "FPS is measured per track using a 1-second rolling window.",
        },
      },
      videoQualityAdaptation: {
        description:
          "Video egress supports quality adaptation for bandwidth-constrained scenarios.",
        qualityProfiles: {
          low: "5 fps — for low bandwidth conditions",
          medium: "10 fps — for moderate bandwidth",
          high: "15 fps — default, full quality",
        },
        apiEndpoint: "POST /api/egress/quality (coming soon)",
      },
      metrics: {
        audio: {
          description: "Audio processing metrics per room",
          fields: {
            chunksReceived: "number — total audio chunks received",
            chunksPublished: "number — successfully published to Kafka",
            publishFailures: "number — failed Kafka publishes",
            lastChunkAt: "string — ISO 8601 timestamp of last chunk",
            errors: "string[] — last 10 error messages",
          },
        },
        video: {
          description: "Video processing metrics per room",
          fields: {
            framesReceived: "number — total video frames received",
            framesPublished: "number — successfully published to Kafka",
            framesDropped: "number — frames dropped due to FPS sampling",
            publishFailures: "number — failed Kafka publishes",
            lastFrameAt: "string — ISO 8601 timestamp of last frame",
            currentFps: "number — current measured FPS (1-second window)",
            targetFps: "number — target FPS (15)",
            errors: "string[] — last 10 error messages",
          },
        },
      },
    };
  }
}
