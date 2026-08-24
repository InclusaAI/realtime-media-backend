import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ClientKafka } from "@nestjs/microservices";
import { LiveKitAdapterService } from "../sfu-adapter/livekit-adapter.service";
import { MediaTapAgent } from "./audio-tap.agent";
import { AudioChunkHandler } from "./audio-chunk.handler";
import { VideoFrameHandler } from "../egress/video-frame.handler";
import { EgressService } from "../egress/egress.service";

/**
 * Manages MediaTapAgent instances per room.
 * Ensures only one tap agent runs per room, preventing duplicate subscriptions.
 *
 * When a new track is subscribed in a room, this service:
 * 1. Registers the track-to-participant mapping in the appropriate handler
 * 2. Starts LiveKit Egress to stream raw media to our /egress WebSocket
 *
 * The EgressController then receives the media and routes it to
 * AudioChunkHandler (audio) or VideoFrameHandler (video).
 */
@Injectable()
export class AudioTapService implements OnModuleDestroy {
  private readonly logger = new Logger(AudioTapService.name);
  private readonly activeTaps: Map<string, MediaTapAgent> = new Map();

  constructor(
    private readonly sfuAdapter: LiveKitAdapterService,
    @Inject("KAFKA_SERVICE") private readonly kafkaClient: ClientKafka,
    private readonly audioChunkHandler: AudioChunkHandler,
    private readonly videoFrameHandler: VideoFrameHandler,
    private readonly egressService: EgressService,
  ) {}

  /**
   * Start a media tap for the given room (audio + video).
   * If a tap is already running for this room, this is a no-op.
   */
  async startAudioTap(roomName: string): Promise<void> {
    if (this.activeTaps.has(roomName)) {
      this.logger.debug(`Media tap already active for room ${roomName}`);
      return;
    }

    try {
      const agent = new MediaTapAgent(
        this.sfuAdapter.getWsUrl(),
        this.kafkaClient,
      );

      // Wire up callbacks for track lifecycle events
      agent.onTrackSubscribed = async (
        trackRoomName,
        trackSid,
        participantIdentity,
        kind,
      ) => {
        this.logger.log(
          `${kind} track subscribed: ${trackSid} from ${participantIdentity} in ${trackRoomName}`,
        );

        if (kind === "audio") {
          // Register in AudioChunkHandler for metadata correlation
          this.audioChunkHandler.setTrackParticipant(
            trackSid,
            participantIdentity,
          );
        } else if (kind === "video") {
          // Register in VideoFrameHandler for metadata correlation
          this.videoFrameHandler.setTrackParticipant(
            trackSid,
            participantIdentity,
          );
        }

        // Start LiveKit Egress to stream media to our WebSocket endpoint
        try {
          const egressWsUrl = this.buildEgressWsUrl(
            trackRoomName,
            trackSid,
            participantIdentity,
            kind,
          );

          // Use EgressService for tracking + LiveKit adapter for actual egress
          await this.egressService.startEgress(
            trackRoomName,
            trackSid,
            kind,
            egressWsUrl,
          );

          this.logger.log(
            `Started ${kind} egress for track ${trackSid} in room ${trackRoomName}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to start ${kind} egress for track ${trackSid}`,
            error,
          );
        }
      };

      agent.onTrackUnsubscribed = (trackSid, kind) => {
        this.logger.log(`${kind} track unsubscribed: ${trackSid}`);
        if (kind === "audio") {
          this.audioChunkHandler.removeTrack(trackSid);
        } else if (kind === "video") {
          this.videoFrameHandler.removeTrack(trackSid);
        }
      };

      // Generate a token for the media tap agent
      const { token } = await this.sfuAdapter.join(
        roomName,
        "media-tap-agent",
      );

      await agent.start(roomName, token);
      this.activeTaps.set(roomName, agent);
      this.logger.log(`Media tap started for room ${roomName}`);
    } catch (error) {
      this.logger.error(
        `Failed to start media tap for room ${roomName}`,
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
   * Stop the media tap for a specific room.
   */
  async stopAudioTap(roomName: string): Promise<void> {
    const agent = this.activeTaps.get(roomName);
    if (agent) {
      await agent.stop();
      this.activeTaps.delete(roomName);
      this.audioChunkHandler.cleanupRoom(roomName);
      this.videoFrameHandler.cleanupRoom(roomName);
      await this.egressService.stopAllForRoom(roomName);
      this.logger.log(`Media tap stopped for room ${roomName}`);
    }
  }

  /**
   * Check if a media tap is active for a room.
   */
  hasActiveTap(roomName: string): boolean {
    return this.activeTaps.has(roomName);
  }

  /**
   * Get the number of active media taps.
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
   * Get video metrics for a room.
   */
  getVideoMetrics(roomName: string) {
    return this.videoFrameHandler.getMetrics(roomName);
  }

  /**
   * Get video metrics for all rooms.
   */
  getAllVideoMetrics() {
    return this.videoFrameHandler.getAllMetrics();
  }

  /**
   * Build the WebSocket URL for LiveKit Egress to stream media data to.
   * This URL points to our EgressController's /egress namespace.
   */
  private buildEgressWsUrl(
    roomName: string,
    trackSid: string,
    participantIdentity: string,
    kind: "audio" | "video",
  ): string {
    // In production, this would be the external URL of the service
    // For local development, use localhost
    const host = process.env.EGRESS_WS_HOST || "localhost";
    const port = process.env.PORT || 3001;
    return `ws://${host}:${port}/egress?roomName=${roomName}&trackSid=${trackSid}&kind=${kind}&participantIdentity=${participantIdentity}`;
  }

  /**
   * Cleanup all active taps on module destroy.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log(
      `Stopping ${this.activeTaps.size} active media taps`,
    );
    const stopPromises = Array.from(this.activeTaps.entries()).map(
      async ([roomName, agent]) => {
        try {
          await agent.stop();
          this.audioChunkHandler.cleanupRoom(roomName);
          this.videoFrameHandler.cleanupRoom(roomName);
          await this.egressService.stopAllForRoom(roomName);
        } catch (error) {
          this.logger.error(
            `Error stopping media tap for room ${roomName}`,
            error,
          );
        }
      },
    );
    await Promise.all(stopPromises);
    this.activeTaps.clear();
  }
}
