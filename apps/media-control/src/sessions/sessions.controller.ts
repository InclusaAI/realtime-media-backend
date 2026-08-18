import { Controller, Post, Get, Delete, Param, Body } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags, ApiBody } from "@nestjs/swagger";
import { SessionsService } from "./sessions.service";
import { CreateSessionDto } from "./dto/create-session.dto";
import { SessionStatusDto } from "./dto/session-status.dto";

@ApiTags("Sessions")
@Controller("api/sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({ summary: "Create a new media session" })
  @ApiBody({ type: CreateSessionDto })
  @ApiResponse({
    status: 201,
    description: "The session has been successfully created.",
  })
  @ApiResponse({ status: 400, description: "Bad Request. Invalid input data." })
  createSession(@Body() createSessionDto: CreateSessionDto) {
    return this.sessionsService.createSession(createSessionDto);
  }

  @Get(":sessionId")
  @ApiOperation({ summary: "Get session details by ID" })
  @ApiResponse({
    status: 200,
    description: "Returns the session details.",
    type: SessionStatusDto,
  })
  @ApiResponse({ status: 404, description: "Session not found." })
  getSession(@Param("sessionId") sessionId: string): Promise<SessionStatusDto> {
    return this.sessionsService.getSession(sessionId);
  }

  @Delete(":sessionId")
  @ApiOperation({ summary: "End a media session" })
  @ApiResponse({
    status: 200,
    description: "The session has been successfully ended.",
  })
  @ApiResponse({ status: 404, description: "Session not found." })
  endSession(@Param("sessionId") sessionId: string) {
    return this.sessionsService.endSession(sessionId);
  }

  @Get(":sessionId/participants")
  @ApiOperation({ summary: "List all participants in a session" })
  @ApiResponse({ status: 200, description: "Returns a list of participants." })
  @ApiResponse({ status: 404, description: "Session not found." })
  getParticipants(@Param("sessionId") sessionId: string) {
    return this.sessionsService.getParticipants(sessionId);
  }

  @Get(":sessionId/metrics")
  @ApiOperation({ summary: "Get connection quality metrics for a session" })
  @ApiResponse({ status: 200, description: "Returns session metrics." })
  @ApiResponse({ status: 404, description: "Session not found." })
  getMetrics(@Param("sessionId") sessionId: string) {
    return this.sessionsService.getMetrics(sessionId);
  }
}
