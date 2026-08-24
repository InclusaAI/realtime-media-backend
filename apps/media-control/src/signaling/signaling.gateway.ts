import { Inject, Logger, OnModuleDestroy, UseGuards } from '@nestjs/common';
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { ClientKafka } from '@nestjs/microservices';
import { Server, Socket } from 'socket.io';
import { JoinRoomGuard } from '../guards/join-room.guard';
import { LiveKitAdapterService } from '../sfu-adapter/livekit-adapter.service';
import { AudioTapService } from '../audio-tap/audio-tap.service';
import { SessionsService } from '../sessions/sessions.service';
import {
  AuthenticatedUser,
  LeaveRoomPayload,
  RelayPayload,
  KafkaParticipantEvent,
} from './types/signaling.types';

/**
 * Extended Socket type with authenticated user data.
 */
interface AuthenticatedSocket extends Socket {
  user?: AuthenticatedUser;
}

@WebSocketGateway()
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(SignalingGateway.name);

  @WebSocketServer()
  server: Server;

  /** Track connected clients by room for cleanup */
  private readonly roomClients: Map<string, Set<string>> = new Map();

  constructor(
    private readonly sfuAdapter: LiveKitAdapterService,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
    private readonly audioTapService: AudioTapService,
    private readonly sessionsService: SessionsService,
  ) {}

  handleConnection(client: AuthenticatedSocket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Clean up room tracking for disconnected client
    for (const [roomName, clients] of this.roomClients) {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.roomClients.delete(roomName);
        }
        break;
      }
    }
  }

  @UseGuards(JoinRoomGuard)
  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    try {
      const user = client.user as AuthenticatedUser;
      if (!user) {
        client.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { roomName, participantIdentity } = user;

      if (!roomName || !participantIdentity) {
        client.emit('error', {
          message: 'Missing roomName or participantIdentity in token',
        });
        return;
      }

      const { token } = await this.sfuAdapter.join(roomName, participantIdentity);
      client.join(roomName);

      // Track client in room
      if (!this.roomClients.has(roomName)) {
        this.roomClients.set(roomName, new Set());
      }
      this.roomClients.get(roomName)!.add(client.id);

      // Sync participant roster with SessionsService
      this.sessionsService.addParticipant(roomName, participantIdentity);

      const joinedEvent = {
        participantIdentity,
        joinedAt: new Date().toISOString(),
      };
      this.server.to(roomName).emit('participant-joined', joinedEvent);

      const kafkaEvent: KafkaParticipantEvent = {
        participantIdentity,
        roomName,
        timestamp: new Date().toISOString(),
      };
      this.kafkaClient.emit(
        `media.session.${roomName}.participant.joined`,
        kafkaEvent,
      );

      client.emit('token', { token });

      // Start audio tap for the room (deduplicates internally)
      this.audioTapService.startAudioTap(roomName).catch((err) => {
        this.logger.error(
          `Failed to start audio tap for room ${roomName}`,
          err,
        );
      });

      this.logger.log(
        `${participantIdentity} joined room ${roomName}`,
      );
    } catch (error) {
      this.logger.error(
        `Error handling join-room for client ${client.id}`,
        error,
      );
      client.emit('error', {
        message: 'Failed to join room',
        details: (error as Error).message,
      });
    }
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @MessageBody() data: LeaveRoomPayload,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    try {
      if (!data?.roomName || !data?.participantIdentity) {
        client.emit('error', {
          message: 'Missing roomName or participantIdentity',
        });
        return;
      }

      await this.sfuAdapter.leave(data.roomName, data.participantIdentity);
      client.leave(data.roomName);

      // Remove from room tracking
      const clients = this.roomClients.get(data.roomName);
      if (clients) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.roomClients.delete(data.roomName);
        }
      }

      // Sync participant roster with SessionsService
      this.sessionsService.removeParticipant(data.roomName, data.participantIdentity);

      const leftEvent = {
        participantIdentity: data.participantIdentity,
        leftAt: new Date().toISOString(),
      };
      this.server.to(data.roomName).emit('participant-left', leftEvent);

      const kafkaEvent: KafkaParticipantEvent = {
        participantIdentity: data.participantIdentity,
        roomName: data.roomName,
        timestamp: new Date().toISOString(),
      };
      this.kafkaClient.emit(
        `media.session.${data.roomName}.participant.left`,
        kafkaEvent,
      );

      this.logger.log(
        `${data.participantIdentity} left room ${data.roomName}`,
      );
    } catch (error) {
      this.logger.error(
        `Error handling leave-room for client ${client.id}`,
        error,
      );
      client.emit('error', {
        message: 'Failed to leave room',
        details: (error as Error).message,
      });
    }
  }

  @SubscribeMessage('offer')
  handleOffer(
    @MessageBody() data: RelayPayload,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): void {
    try {
      if (!data?.to || !data?.offer) {
        client.emit('error', { message: 'Invalid offer payload' });
        return;
      }

      this.server.to(data.to).emit('offer', {
        from: client.id,
        offer: data.offer,
      });
    } catch (error) {
      this.logger.error(`Error relaying offer from ${client.id}`, error);
      client.emit('error', {
        message: 'Failed to relay offer',
        details: (error as Error).message,
      });
    }
  }

  @SubscribeMessage('answer')
  handleAnswer(
    @MessageBody() data: RelayPayload,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): void {
    try {
      if (!data?.to || !data?.answer) {
        client.emit('error', { message: 'Invalid answer payload' });
        return;
      }

      this.server.to(data.to).emit('answer', {
        from: client.id,
        answer: data.answer,
      });
    } catch (error) {
      this.logger.error(`Error relaying answer from ${client.id}`, error);
      client.emit('error', {
        message: 'Failed to relay answer',
        details: (error as Error).message,
      });
    }
  }

  @SubscribeMessage('ice-candidate')
  handleIceCandidate(
    @MessageBody() data: RelayPayload,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): void {
    try {
      if (!data?.to || !data?.candidate) {
        client.emit('error', { message: 'Invalid ice-candidate payload' });
        return;
      }

      this.server.to(data.to).emit('ice-candidate', {
        from: client.id,
        candidate: data.candidate,
      });
    } catch (error) {
      this.logger.error(
        `Error relaying ice-candidate from ${client.id}`,
        error,
      );
      client.emit('error', {
        message: 'Failed to relay ice-candidate',
        details: (error as Error).message,
      });
    }
  }

  /**
   * Cleanup on module destroy: stop audio taps and disconnect all rooms.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log(
      `SignalingGateway shutting down: cleaning up ${this.roomClients.size} rooms`,
    );

    const cleanupPromises: Promise<void>[] = [];

    for (const roomName of this.roomClients.keys()) {
      cleanupPromises.push(
        this.audioTapService.stopAudioTap(roomName).catch((err) => {
          this.logger.error(
            `Error stopping audio tap for room ${roomName} during shutdown`,
            err,
          );
        }),
      );
    }

    await Promise.all(cleanupPromises);
    this.roomClients.clear();
    this.logger.log('SignalingGateway cleanup complete');
  }
}
