import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { CreateSessionDto, SessionMode } from './dto/create-session.dto';
import { SessionStatusDto } from './dto/session-status.dto';

/**
 * Internal representation of a session stored in-memory.
 */
interface Session {
  id: string;
  state: 'initializing' | 'active' | 'ending' | 'ended';
  mode: SessionMode;
  initiatorId: string;
  roomName: string;
  participants: Array<{ identity: string; joinedAt: Date }>;
  metrics: {
    packetLoss: number;
    jitter: number;
    rtt: number;
    bitrate: number;
  };
  createdAt: Date;
  endedAt?: Date;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly sessions: Map<string, Session> = new Map();

  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  createSession(createSessionDto: CreateSessionDto) {
    const sessionId =
      createSessionDto.sessionId ||
      `session_${Math.random().toString(36).substring(2, 10)}`;

    // Use sessionId as the LiveKit room name for 1:1 mapping
    const roomName = sessionId;

    const newSession: Session = {
      id: sessionId,
      state: 'active',
      mode: createSessionDto.mode,
      initiatorId: createSessionDto.initiatorId,
      roomName,
      participants: [],
      metrics: { packetLoss: 0, jitter: 0, rtt: 0, bitrate: 0 },
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, newSession);
    this.logger.log(`Session created: ${sessionId} (mode: ${createSessionDto.mode})`);

    // Publish session.created event for other services
    this.kafkaClient.emit('session.created', {
      sessionId,
      roomName,
      initiatorId: createSessionDto.initiatorId,
      mode: createSessionDto.mode,
      timestamp: new Date().toISOString(),
    });

    return {
      status: 'success',
      message: 'Session created',
      data: this.toStatusDto(newSession),
    };
  }

  async getSession(sessionId: string): Promise<SessionStatusDto> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
    }

    return this.toStatusDto(session);
  }

  async endSession(sessionId: string) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
    }

    session.state = 'ended';
    session.endedAt = new Date();

    this.logger.log(`Session ended: ${sessionId}`);

    // Publish session.ended event for cleanup in other services
    this.kafkaClient.emit('session.ended', {
      sessionId,
      roomName: session.roomName,
      timestamp: new Date().toISOString(),
      durationMs: session.endedAt.getTime() - session.createdAt.getTime(),
    });

    return {
      status: 'success',
      message: `Session ${sessionId} ended`,
    };
  }

  getParticipants(sessionId: string) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
    }

    return {
      status: 'success',
      data: { participants: session.participants },
    };
  }

  getMetrics(sessionId: string) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
    }

    return {
      status: 'success',
      data: { metrics: session.metrics },
    };
  }

  /**
   * Add a participant to a session (called from SignalingGateway on join).
   */
  addParticipant(sessionId: string, participantIdentity: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const exists = session.participants.some(
        (p) => p.identity === participantIdentity,
      );
      if (!exists) {
        session.participants.push({
          identity: participantIdentity,
          joinedAt: new Date(),
        });
        this.logger.debug(
          `Participant ${participantIdentity} added to session ${sessionId}`,
        );
      }
    }
  }

  /**
   * Remove a participant from a session (called from SignalingGateway on leave).
   */
  removeParticipant(sessionId: string, participantIdentity: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.participants = session.participants.filter(
        (p) => p.identity !== participantIdentity,
      );
      this.logger.debug(
        `Participant ${participantIdentity} removed from session ${sessionId}`,
      );
    }
  }

  /**
   * Find a session by its room name (1:1 mapping).
   */
  findByRoomName(roomName: string): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.roomName === roomName) {
        return session;
      }
    }
    return undefined;
  }

  private toStatusDto(session: Session): SessionStatusDto {
    return {
      id: session.id,
      state: session.state,
      createdAt: session.createdAt,
      participants: session.participants.map((p) => ({
        identity: p.identity,
        name: p.identity,
      })),
      metrics: session.metrics,
    };
  }
}
