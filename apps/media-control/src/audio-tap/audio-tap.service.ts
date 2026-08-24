import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ClientKafka } from "@nestjs/microservices";
import { LiveKitAdapterService } from "../sfu-adapter/livekit-adapter.service";
import { AudioTapAgent } from "./audio-tap.agent";
import { AudioChunkHandler } from "./audio-chunk.handler";

/**
 * Manages AudioTapAgent instances per room.
 * Ensures only one tap agent runs per room, preventing duplicate subscriptions.
 *
 * When a new audio track is subscribed in a room, this service:
 * 1. Registers the track-to-participant mapping in AudioChunkHandler
 * 2. Starts LiveKit Egress to stream raw audio to our /egress WebSocket
 *
 * The EgressController then receives the audio and publishes to Kafka.
 */
@Injectable()
export class AudioTapService implements OnModuleDestroy {
  private readonly logger = new Logger(AudioTapService.name);
  private readonly activeTaps: Map<string, AudioTapAgent> = new Map();

  constructor(
    private readonly sfuAdapter: LiveKitAdapterService,
    @Inject("KAFKA_SERVICE") private readonly kafkaClient: ClientKafka,
    private readonly audioChunkHandler: AudioChunkHandler,
  ) {}

  /**
   * Start an audio tap for the given room.
   * If a tap is already running for this room, this is a no-op.
   */
  async startAudioTap(roomName: string): Promise<void> {
    if (this.activeTaps.has(roomName)) {
      this.logger.debug(`Audio tap already active for room ${roomName}`);
      return;
    }

    try {
      const agent = new AudioTapAgent(
        this.sfuAdapter.getWsUrl(),
        this.kafkaClient,
      );

      // Wire up callbacks for track lifecycle events
      agent.onTrackSubscribed = async (
        trackRoomName,
        trackSid,
        participantIdentity,
      ) => {
        this.logger.log(
          `Track subscribed: ${trackSid} from ${participantIdentity} in ${trackRoomName}`,
        );

        // Register in AudioChunkHandler for metadata correlation
        this.audioChunkHandler.setTrackParticipant(
          trackSid,
          participantIdentity,
        );

        // Start LiveKit Egress to stream audio to our WebSocket endpoint
        try {
          const egressWsUrl = this.buildEgressWsUrl(
            trackRoomName,
            trackSid,
            participantIdentity,
          );
          await this.sfuAdapter.startEgress(
            trackRoomName,
            trackSid,
            egressWsUrl,
          );
          this.logger.log(
            `Started egress for track ${trackSid} in room ${trackRoomName}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to start egress for track ${trackSid}`,
            error,
          );
        }
      };

      agent.onTrackUnsubscribed = (trackSid) => {
        this.logger.log(`Track unsubscribed: ${trackSid}`);
        this.audioChunkHandler.removeTrack(trackSid);
      };

      // Generate a token for the audio tap agent
      const { token } = await this.sfuAdapter.join(
        roomName,
        "audio-tap-agent",
      );

      await agent.start(roomName, token);
      this.activeTaps.set(roomName, agent);
      this.logger.log(`Audio tap started for room ${roomName}`);
    } catch (error) {
      this.logger.error(
        `Failed to start audio tap for room ${roomName}`,
        error,
      );
      // Clean up partial state
      const agent = this.activeTaps.get(roomName);
      if (agent) {
        await agent.stop().catch(() => {});
        this.activeTaps.delete(roomName);
      }
    }
  }

  /**
   * Stop the audio tap for a specific room.
   */
  async stopAudioTap(roomName: string): Promise<void> {
    const agent = this.activeTaps.get(roomName);
    if (agent) {
      await agent.stop();
      this.activeTaps.delete(roomName);
      this.audioChunkHandler.cleanupRoom(roomName);
      this.logger.log(`Audio tap stopped for room ${roomName}`);
    }
  }

  /**
   * Check if an audio tap is active for a room.
   */
  hasActiveTap(roomName: string): boolean {
    return this.activeTaps.has(roomName);
  }

  /**
   * Get the number of active audio taps.
   */
  getActiveTapCount(): number {
    return this.activeTaps.size;
  }

  /**
   * Get audio metrics for a room.
   */
  getAudioMetrics(roomName: string) {
    return this.audioChunkHandler.getMetrics(roomName);
  }

  /**
   * Get audio metrics for all rooms.
   */
  getAllAudioMetrics() {
    return this.audioChunkHandler.getAllMetrics();
  }

  /**
   * Build the WebSocket URL for LiveKit Egress to stream audio data to.
   * This URL points to our EgressController's /egress namespace.
   */
  private buildEgressWsUrl(
    roomName: string,
    trackSid: string,
    participantIdentity: string,
  ): string {
    // In production, this would be the external URL of the service
    // For local development, use localhost
    const host = process.env.EGRESS_WS_HOST || "localhost";
    const port = process.env.PORT || 3001;
    return `ws://${host}:${port}/egress?roomName=${roomName}&trackSid=${trackSid}&kind=audio&participantIdentity=${participantIdentity}`;
  }

  /**
   * Cleanup all active taps on module destroy.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log(
      `Stopping ${this.activeTaps.size} active audio taps`,
    );
    const stopPromises = Array.from(this.activeTaps.entries()).map(
      async ([roomName, agent]) => {
        try {
          await agent.stop();
          this.audioChunkHandler.cleanupRoom(roomName);
        } catch (error) {
          this.logger.error(
            `Error stopping audio tap for room ${roomName}`,
            error,
          );
        }
      },
    );
    await Promise.all(stopPromises);
    this.activeTaps.clear();
  }
}
