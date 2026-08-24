import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { CreateSessionDto, SessionMode } from './dto/create-session.dto';
import { SessionStatusDto } from './dto/session-status.dto';

/**
 * Session states and valid transitions.
 *
 * State machine:
 *   INITIALIZING → ACTIVE → ENDING → ENDED
 *        ↓                      ↑
 *   (timeout)            (explicit end)
 *        ↓                      ↑
 *      ENDED              ENDING
 *
 * Reconnection: ACTIVE → RECONNECTING → ACTIVE (within grace period)
 */
export type SessionState = 'initializing' | 'active' | 'reconnecting' | 'ending' | 'ended';

/** Valid state transitions */
const VALID_TRANSITIONS: Record<SessionState, SessionState[]> = {
  initializing: ['active', 'ended'],
  active: ['reconnecting', 'ending', 'ended'],
  reconnecting: ['active', 'ending', 'ended'],
  ending: ['ended'],
  ended: [], // terminal state
};

/** Default reconnection grace period (30 seconds) */
const DEFAULT_RECONNECT_GRACE_MS = 30_000;

/**
 * Connection quality metrics for a participant.
 */
export interface ConnectionQuality {
  participantIdentity: string;
  rtt: number;          // round-trip time in ms
  packetLoss: number;    // 0-100 percentage
  jitter: number;        // in ms
  bitrate: number;       // in kbps
  lastUpdated: Date;
}

/**
 * Reconnection state for a participant.
 */
export interface ReconnectState {
  participantIdentity: string;
  disconnectedAt: Date;
  gracePeriodMs: number;
  /** Whether the participant has reconnected within the grace period */
  reconnected: boolean;
}

/**
 * Internal representation of a session stored in-memory.
 */
interface Session {
  id: string;
  state: SessionState;
  mode: SessionMode;
  initiatorId: string;
  roomName: string;
  participants: Array<{ identity: string; joinedAt: Date }>;
  /** Connection quality per participant */
  connectionQuality: Map<string, ConnectionQuality>;
  /** Pending reconnections (disconnected but within grace period) */
  pendingReconnections: Map<string, ReconnectState>;
  metrics: {
    packetLoss: number;
    jitter: number;
    rtt: number;
    bitrate: number;
  };
  createdAt: Date;
  endedAt?: Date;
  /** Grace period in milliseconds (configurable per session) */
  reconnectGraceMs: number;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly sessions: Map<string, Session> = new Map();

  /** Periodic cleanup timer for expired reconnections */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {
    // Run reconnection cleanup every 5 seconds
    this.cleanupTimer = setInterval(() => this.cleanupExpiredReconnections(), 5_000);
  }

  /**
   * Create a new media session.
   * Transitions: → INITIALIZING → ACTIVE (immediately, since no async setup needed)
   */
  createSession(createSessionDto: CreateSessionDto) {
    const sessionId =
      createSessionDto.sessionId ||
      `session_${Math.random().toString(36).substring(2, 10)}`;

    // Use sessionId as the LiveKit room name for 1:1 mapping
    const roomName = sessionId;

    const newSession: Session = {
      id: sessionId,
      state: 'initializing',
      mode: createSessionDto.mode,
      initiatorId: createSessionDto.initiatorId,
      roomName,
      participants: [],
      connectionQuality: new Map(),
      pendingReconnections: new Map(),
      metrics: { packetLoss: 0, jitter: 0, rtt: 0, bitrate: 0 },
      createdAt: new Date(),
      reconnectGraceMs: DEFAULT_RECONNECT_GRACE_MS,
    };

    this.sessions.set(sessionId, newSession);
    this.logger.log(`Session created: ${sessionId} (mode: ${createSessionDto.mode})`);

    // Transition to active (no async setup needed)
    this.transitionState(newSession, 'active');

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

  /**
   * Get session details by ID.
   */
  async getSession(sessionId: string): Promise<SessionStatusDto> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
    }

    return this.toStatusDto(session);
  }

  /**
   * End a session.
   * Transitions: any → ENDING → ENDED
   */
  async endSession(sessionId: string) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
    }

    if (session.state === 'ended') {
      throw new BadRequestException(`Session ${sessionId} is already ended.`);
    }

    // Transition through ending to ended
    this.transitionState(session, 'ending');
    this.transitionState(session, 'ended');

    this.logger.log(`Session ended: ${sessionId}`);

    // Publish session.ended event for cleanup in other services
    this.kafkaClient.emit('session.ended', {
      sessionId,
      roomName: session.roomName,
      timestamp: new Date().toISOString(),
      durationMs: session.endedAt!.getTime() - session.createdAt.getTime(),
    });

    return {
      status: 'success',
      message: `Session ${sessionId} ended`,
    };
  }

  /**
   * Get participants in a session.
   */
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

  /**
   * Get connection metrics for a session.
   */
  getMetrics(sessionId: string) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
    }

    // Aggregate metrics from all participants
    const qualities = Array.from(session.connectionQuality.values());
    const avgMetrics = {
      packetLoss: qualities.length > 0
        ? qualities.reduce((sum, q) => sum + q.packetLoss, 0) / qualities.length
        : 0,
      jitter: qualities.length > 0
        ? qualities.reduce((sum, q) => sum + q.jitter, 0) / qualities.length
        : 0,
      rtt: qualities.length > 0
        ? qualities.reduce((sum, q) => sum + q.rtt, 0) / qualities.length
        : 0,
      bitrate: qualities.reduce((sum, q) => sum + q.bitrate, 0),
    };

    return {
      status: 'success',
      data: {
        metrics: avgMetrics,
        participants: qualities.length,
        reconnecting: Array.from(session.pendingReconnections.values())
          .filter((r) => !r.reconnected)
          .map((r) => r.participantIdentity),
      },
    };
  }

  /**
   * Add a participant to a session (called from SignalingGateway on join).
   * Handles both fresh joins and reconnections.
   */
  addParticipant(sessionId: string, participantIdentity: string): { isReconnection: boolean } {
    const session = this.sessions.get(sessionId);
    if (!session) return { isReconnection: false };

    // Check if this is a reconnection
    const pendingReconnect = session.pendingReconnections.get(participantIdentity);
    if (pendingReconnect) {
      // Participant is reconnecting within grace period
      pendingReconnect.reconnected = true;
      session.pendingReconnections.delete(participantIdentity);
      this.logger.log(
        `Participant ${participantIdentity} reconnected to session ${sessionId} (within grace period)`,
      );
      this.kafkaClient.emit(`media.session.${session.roomName}.participant.reconnected`, {
        participantIdentity,
        roomName: session.roomName,
        wasDisconnectedAt: pendingReconnect.disconnectedAt.toISOString(),
        reconnectedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });
      return { isReconnection: true };
    }

    // Fresh join
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
    return { isReconnection: false };
  }

  /**
   * Remove a participant from a session (called from SignalingGateway on leave).
   * If the session has a grace period, the participant is moved to pending reconnection
   * instead of being immediately removed.
   */
  removeParticipant(sessionId: string, participantIdentity: string): { gracePeriodMs: number } {
    const session = this.sessions.get(sessionId);
    if (!session) return { gracePeriodMs: 0 };

    // Move to pending reconnection (grace period)
    session.pendingReconnections.set(participantIdentity, {
      participantIdentity,
      disconnectedAt: new Date(),
      gracePeriodMs: session.reconnectGraceMs,
      reconnected: false,
    });

    this.logger.debug(
      `Participant ${participantIdentity} disconnected from session ${sessionId} (grace period: ${session.reconnectGraceMs}ms)`,
    );

    return { gracePeriodMs: session.reconnectGraceMs };
  }

  /**
   * Update connection quality for a participant.
   */
  updateConnectionQuality(
    sessionId: string,
    participantIdentity: string,
    quality: Partial<ConnectionQuality>,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const existing = session.connectionQuality.get(participantIdentity);
    const updated: ConnectionQuality = {
      participantIdentity,
      rtt: quality.rtt ?? existing?.rtt ?? 0,
      packetLoss: quality.packetLoss ?? existing?.packetLoss ?? 0,
      jitter: quality.jitter ?? existing?.jitter ?? 0,
      bitrate: quality.bitrate ?? existing?.bitrate ?? 0,
      lastUpdated: new Date(),
    };

    session.connectionQuality.set(participantIdentity, updated);
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

  /**
   * Get reconnection state for a participant.
   */
  getReconnectState(sessionId: string, participantIdentity: string): ReconnectState | undefined {
    const session = this.sessions.get(sessionId);
    return session?.pendingReconnections.get(participantIdentity);
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.state !== 'ended',
    );
  }

  /**
   * Cleanup expired reconnection windows.
   * Force-removes participants who haven't reconnected within their grace period.
   */
  private cleanupExpiredReconnections(): void {
    const now = Date.now();

    for (const session of this.sessions.values()) {
      if (session.state === 'ended') continue;

      for (const [identity, reconnect] of session.pendingReconnections) {
        const elapsed = now - reconnect.disconnectedAt.getTime();
        if (elapsed > reconnect.gracePeriodMs && !reconnect.reconnected) {
          // Grace period expired — permanently remove participant
          session.participants = session.participants.filter(
            (p) => p.identity !== identity,
          );
          session.connectionQuality.delete(identity);
          session.pendingReconnections.delete(identity);

          this.logger.log(
            `Participant ${identity} grace period expired in session ${session.id} — removed`,
          );

          this.kafkaClient.emit(`media.session.${session.roomName}.participant.left`, {
            participantIdentity: identity,
            roomName: session.roomName,
            reason: 'grace_period_expired',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  }

  /**
   * Validate and perform a state transition.
   */
  private transitionState(session: Session, newState: SessionState): void {
    const current = session.state;
    const valid = VALID_TRANSITIONS[current];

    if (!valid.includes(newState)) {
      throw new BadRequestException(
        `Invalid state transition: ${current} → ${newState}`,
      );
    }

    session.state = newState;

    if (newState === 'ended') {
      session.endedAt = new Date();
    }

    this.logger.debug(`Session ${session.id}: ${current} → ${newState}`);
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
