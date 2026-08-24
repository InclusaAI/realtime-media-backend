import { Controller, Post, Get, Delete, Param, Body } from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiParam,
} from "@nestjs/swagger";
import { SessionsService } from "./sessions.service";
import { CreateSessionDto } from "./dto/create-session.dto";
import { SessionStatusDto } from "./dto/session-status.dto";

@ApiTags("Sessions")
@Controller("api/sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({
    summary: "Create a new media session",
    description:
      "Creates a new media session and returns its details. " +
      "The session ID is used as the LiveKit room name (1:1 mapping). " +
      "Publishes a session.created event to Kafka.",
  })
  @ApiBody({ type: CreateSessionDto })
  @ApiResponse({
    status: 201,
    description: "Session created successfully.",
    schema: {
      example: {
        status: "success",
        message: "Session created",
        data: {
          id: "project-kickoff-meeting",
          state: "active",
          createdAt: "2025-01-15T10:30:00.000Z",
          participants: [],
          metrics: {
            packetLoss: 0,
            jitter: 0,
            rtt: 0,
            bitrate: 0,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Bad Request — invalid input data.",
    schema: {
      example: {
        statusCode: 400,
        message: ["initiatorId should not be empty", "mode must be a valid enum value"],
        error: "Bad Request",
      },
    },
  })
  createSession(@Body() createSessionDto: CreateSessionDto) {
    return this.sessionsService.createSession(createSessionDto);
  }

  @Get(":sessionId")
  @ApiOperation({
    summary: "Get session details by ID",
    description:
      "Returns the full session state including participants, metrics, and timestamps.",
  })
  @ApiParam({
    name: "sessionId",
    description: "The unique session identifier",
    example: "project-kickoff-meeting",
  })
  @ApiResponse({
    status: 200,
    description: "Session details returned.",
    type: SessionStatusDto,
    schema: {
      example: {
        id: "project-kickoff-meeting",
        state: "active",
        createdAt: "2025-01-15T10:30:00.000Z",
        participants: [
          {
            identity: "participant-user-123",
            name: "participant-user-123",
          },
        ],
        metrics: {
          packetLoss: 0.5,
          jitter: 15,
          rtt: 80,
          bitrate: 1500,
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "Session not found.",
    schema: {
      example: {
        statusCode: 404,
        message: 'Session with ID "nonexistent" not found.',
        error: "Not Found",
      },
    },
  })
  getSession(@Param("sessionId") sessionId: string): Promise<SessionStatusDto> {
    return this.sessionsService.getSession(sessionId);
  }

  @Delete(":sessionId")
  @ApiOperation({
    summary: "End a media session",
    description:
      "Ends the session, updates its state to 'ended', and publishes a session.ended event to Kafka. " +
      "Triggers cleanup of audio taps and egress sessions.",
  })
  @ApiParam({
    name: "sessionId",
    description: "The unique session identifier",
    example: "project-kickoff-meeting",
  })
  @ApiResponse({
    status: 200,
    description: "Session ended successfully.",
    schema: {
      example: {
        status: "success",
        message: "Session project-kickoff-meeting ended",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "Session not found.",
  })
  endSession(@Param("sessionId") sessionId: string) {
    return this.sessionsService.endSession(sessionId);
  }

  @Get(":sessionId/participants")
  @ApiOperation({
    summary: "List all participants in a session",
    description:
      "Returns the current participant roster for the session. " +
      "Participants are tracked as they join/leave via WebSocket signaling.",
  })
  @ApiParam({
    name: "sessionId",
    description: "The unique session identifier",
    example: "project-kickoff-meeting",
  })
  @ApiResponse({
    status: 200,
    description: "Participant list returned.",
    schema: {
      example: {
        status: "success",
        data: {
          participants: [
            {
              identity: "participant-user-123",
              joinedAt: "2025-01-15T10:30:05.000Z",
            },
            {
              identity: "participant-user-456",
              joinedAt: "2025-01-15T10:31:00.000Z",
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "Session not found.",
  })
  getParticipants(@Param("sessionId") sessionId: string) {
    return this.sessionsService.getParticipants(sessionId);
  }

  @Get(":sessionId/metrics")
  @ApiOperation({
    summary: "Get connection quality metrics for a session",
    description:
      "Returns aggregated connection quality metrics across all participants: " +
      "packet loss, jitter, round-trip time, and bitrate.",
  })
  @ApiParam({
    name: "sessionId",
    description: "The unique session identifier",
    example: "project-kickoff-meeting",
  })
  @ApiResponse({
    status: 200,
    description: "Session metrics returned.",
    schema: {
      example: {
        status: "success",
        data: {
          metrics: {
            packetLoss: 0.5,
            jitter: 15,
            rtt: 80,
            bitrate: 1500,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "Session not found.",
  })
  getMetrics(@Param("sessionId") sessionId: string) {
    return this.sessionsService.getMetrics(sessionId);
  }
}
