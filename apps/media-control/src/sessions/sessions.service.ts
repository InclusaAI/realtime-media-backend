import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionStatusDto } from './dto/session-status.dto';

@Injectable()
export class SessionsService {
  // In-memory store for placeholder data
  private readonly sessions: Map<string, any> = new Map();

  createSession(createSessionDto: CreateSessionDto) {
    const sessionId = createSessionDto.sessionId || `session_${Math.random().toString(36).substring(2, 10)}`;
    console.log(`Creating a new session with ID: ${sessionId}`, createSessionDto);
    
    const newSession = {
      id: sessionId,
      state: 'active',
      createdAt: new Date(),
      participants: [],
      metrics: { packetLoss: 0, jitter: 0, rtt: 0, bitrate: 0 },
      ...createSessionDto,
    };
    this.sessions.set(sessionId, newSession);

    return { status: 'success', message: 'Session created', data: newSession };
  }

  async getSession(sessionId: string): Promise<SessionStatusDto> {
    console.log(`Fetching details for session ${sessionId}...`);
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
    }

    // This is a placeholder. In a real app, you would fetch this data from a database or cache.
    const sessionStatus: SessionStatusDto = {
      id: session.id,
      state: session.state,
      createdAt: session.createdAt,
      participants: session.participants,
      metrics: session.metrics,
    };
    
    return sessionStatus;
  }

  endSession(sessionId: string) {
    console.log(`Ending session ${sessionId}...`);
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = 'ended';
      this.sessions.set(sessionId, session);
      return { status: 'success', message: `Session ${sessionId} ended` };
    }
    throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
  }

  getParticipants(sessionId: string) {
    console.log(`Fetching participants for session ${sessionId}...`);
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
    }
    return { status: 'success', data: { participants: session.participants } };
  }

  getMetrics(sessionId: string) {
    console.log(`Fetching metrics for session ${sessionId}...`);
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found.`);
    }
    return { status: 'success', data: { metrics: session.metrics } };
  }
}