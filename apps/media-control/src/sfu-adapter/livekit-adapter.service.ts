import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  EgressClient,
  RoomServiceClient,
} from 'livekit-server-sdk';
import { SfuAdapter, TrackInfo } from './interfaces/sfu-adapter.interface';

@Injectable()
export class LiveKitAdapterService implements SfuAdapter, OnModuleDestroy {
  private readonly logger = new Logger(LiveKitAdapterService.name);
  private readonly roomService: RoomServiceClient;
  private readonly egressClient: EgressClient;
  private readonly serverUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.serverUrl =
      this.configService.get<string>('LIVEKIT_SERVER_URL') ||
      'http://localhost:7880';
    this.apiKey = this.configService.get<string>('LIVEKIT_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET') || '';

    if (!this.apiKey || !this.apiSecret) {
      this.logger.warn(
        'LiveKit API key or secret not configured. SFU operations will fail.',
      );
    }

    this.roomService = new RoomServiceClient(
      this.serverUrl,
      this.apiKey,
      this.apiSecret,
    );
    this.egressClient = new EgressClient(
      this.serverUrl,
      this.apiKey,
      this.apiSecret,
    );
  }

  async getRoomState(roomName: string): Promise<unknown> {
    try {
      const room = await this.roomService.listRooms([roomName]);
      return room.length > 0 ? room[0] : null;
    } catch (error) {
      this.logger.error(`Failed to get room state for ${roomName}`, error);
      throw error;
    }
  }

  /**
   * Start track egress for a specific track in a room.
   * @param roomName - the LiveKit room name
   * @param trackId - the track SID to capture
   * @param websocketUrl - optional WebSocket URL to stream audio data to.
   *                       If not provided, returns a pending status (egress not configured).
   * @returns Egress info from LiveKit, or a pending/error status object
   */
  async startEgress(
    roomName: string,
    trackId: string,
    websocketUrl?: string,
  ): Promise<unknown> {
    try {
      this.logger.log(
        `Starting egress for room ${roomName}, track ${trackId}`,
      );

      // If a WebSocket URL is provided, stream raw track data to it
      if (websocketUrl) {
        const egressInfo = await this.egressClient.startTrackEgress(
          roomName,
          websocketUrl,
          trackId,
        );
        this.logger.log(
          `Egress started for track ${trackId}: egressId=${egressInfo.egressId}`,
        );
        return {
          egressId: egressInfo.egressId,
          status: 'active',
          roomName,
          trackId,
        };
      }

      // No WebSocket URL configured — log and return pending
      this.logger.warn(
        `No WebSocket URL configured for egress. Track ${trackId} in room ${roomName} will not be captured.`,
      );
      return { status: 'pending', roomName, trackId };
    } catch (error) {
      this.logger.error(
        `Failed to start egress for room ${roomName}, track ${trackId}`,
        error,
      );
      throw error;
    }
  }

  async join(
    roomName: string,
    participantIdentity: string,
  ): Promise<{ token: string }> {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: participantIdentity,
    });
    at.addGrant({ roomJoin: true, room: roomName });

    const token = await at.toJwt();
    this.logger.log(
      `Generated token for ${participantIdentity} in room ${roomName}`,
    );
    return { token };
  }

  async leave(roomName: string, participantIdentity: string): Promise<void> {
    try {
      await this.roomService.removeParticipant(roomName, participantIdentity);
      this.logger.log(
        `Removed ${participantIdentity} from room ${roomName}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove ${participantIdentity} from room ${roomName}`,
        error,
      );
      throw error;
    }
  }

  async publish(
    roomName: string,
    participantIdentity: string,
    trackInfo: TrackInfo,
  ): Promise<unknown> {
    await this.roomService.updateParticipant(
      roomName,
      participantIdentity,
      undefined,
      {
        canPublish: true,
        canSubscribe: true,
      },
    );
    this.logger.log(
      `Updated publish permissions for ${participantIdentity} in room ${roomName} (track: ${trackInfo.sid})`,
    );
    return undefined;
  }

  async subscribe(
    roomName: string,
    participantIdentity: string,
    trackId: string,
  ): Promise<unknown> {
    await this.roomService.updateParticipant(
      roomName,
      participantIdentity,
      undefined,
      {
        canPublish: true,
        canSubscribe: true,
      },
    );
    return undefined;
  }

  getWsUrl(): string {
    return this.serverUrl;
  }

  onModuleDestroy(): void {
    this.logger.log('LiveKitAdapterService shutting down');
  }
}
