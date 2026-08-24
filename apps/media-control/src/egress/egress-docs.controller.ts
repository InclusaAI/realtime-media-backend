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
        "LiveKit connects as a client with query parameters identifying the track.",
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
          "ws://localhost:3001/egress?roomName=my-room&trackSid=TR_ABC123&kind=audio&participantIdentity=user-123",
      },
      "client-to-server": {
        audio: {
          description:
            "Binary audio frame from LiveKit Egress. " +
            "First 4 bytes: payload size (big-endian uint32), followed by Opus-encoded audio payload.",
          format: "binary",
        },
        raw_binary: {
          description:
            "Alternative: raw binary frame without event name. " +
            "Handled identically to the 'audio' event when kind=audio.",
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
    };
  }
}
