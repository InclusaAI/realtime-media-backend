import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Track,
} from "livekit-client";
import { ClientKafka } from "@nestjs/microservices";
import { Logger } from "@nestjs/common";

/**
 * AudioTapAgent connects to a LiveKit room as a subscriber,
 * captures audio tracks from participants, and publishes
 * audio chunks to Kafka for downstream AI services (ASR).
 *
 * Architecture:
 * - Subscribes to all audio tracks in a room
 * - Tracks which participant owns each track (trackSid -> identity)
 * - Publishes metadata (speakerId, trackSid) to Kafka
 * - Actual audio data flows via LiveKit Egress -> WebSocket -> AudioChunkHandler
 *
 * The agent itself handles the LiveKit SDK connection and track management.
 * Raw audio processing is delegated to AudioChunkHandler via the Egress pipeline.
 */
export class AudioTapAgent {
  private readonly logger = new Logger(AudioTapAgent.name);
  private room: Room | null = null;
  private trackToParticipant: Map<string, string> = new Map();
  private sequence: number = 0;
  private running: boolean = false;

  /** Callback when a new audio track is subscribed */
  onTrackSubscribed?: (
    roomName: string,
    trackSid: string,
    participantIdentity: string,
  ) => void;

  /** Callback when an audio track is unsubscribed */
  onTrackUnsubscribed?: (trackSid: string) => void;

  constructor(
    private readonly serverUrl: string,
    private readonly kafkaClient: ClientKafka,
  ) {}

  /**
   * Connect to the room and start capturing audio tracks.
   * @param roomName - LiveKit room name to join
   * @param token - access token for authentication
   */
  async start(roomName: string, token: string): Promise<void> {
    if (this.running) {
      this.logger.warn("AudioTapAgent already running");
      return;
    }

    this.room = new Room({
      adaptiveStream: false,
      dynacast: false,
    });

    // Handle new audio track subscriptions
    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (track.kind === Track.Kind.Audio) {
          const trackSid = track.sid;
          const participantIdentity = participant.identity;

          this.logger.log(
            `Subscribed to audio track ${trackSid} from ${participantIdentity} in room ${roomName}`,
          );

          this.trackToParticipant.set(trackSid, participantIdentity);

          // Notify callback (used by AudioTapService to start egress)
          this.onTrackSubscribed?.(
            roomName,
            trackSid,
            participantIdentity,
          );

          // Publish participant joined event to Kafka
          this.publishParticipantAudioEvent(
            roomName,
            trackSid,
            participantIdentity,
            "track_subscribed",
          );
        }
      },
    );

    // Handle track unsubscriptions
    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      const trackSid = track.sid;
      const participantIdentity =
        this.trackToParticipant.get(trackSid) || "unknown";

      this.logger.log(
        `Audio track ${trackSid} unsubscribed from ${participantIdentity}`,
      );

      this.trackToParticipant.delete(trackSid);
      this.onTrackUnsubscribed?.(trackSid);
    });

    // Handle disconnection
    this.room.on(RoomEvent.Disconnected, () => {
      this.logger.warn(`Audio tap disconnected from room ${roomName}`);
      this.running = false;
    });

    // Handle reconnection
    this.room.on(RoomEvent.Reconnected, () => {
      this.logger.log(`Audio tap reconnected to room ${roomName}`);
      this.running = true;
    });

    this.room.on(RoomEvent.Connected, () => {
      this.logger.log(`Audio tap connected to room ${roomName}`);
    });

    try {
      await this.room.connect(this.serverUrl, token);
      this.running = true;
      this.logger.log(`AudioTapAgent started for room ${roomName}`);
    } catch (error) {
      this.logger.error(
        `Failed to connect AudioTapAgent to room ${roomName}`,
        error,
      );
      this.running = false;
      throw error;
    }
  }

  /**
   * Publish a metadata event when a track is subscribed/unsubscribed.
   * This helps downstream services correlate tracks with participants.
   */
  private publishParticipantAudioEvent(
    roomName: string,
    trackSid: string,
    participantIdentity: string,
    event: string,
  ): void {
    this.sequence++;

    const message = {
      event,
      speakerId: participantIdentity,
      trackSid,
      sequence: this.sequence,
      timestamp: new Date().toISOString(),
      roomName,
    };

    this.kafkaClient.emit(
      `media.session.${roomName}.audio.metadata`,
      message,
    );
  }

  /**
   * Stop the agent, disconnect from the room, and clean up resources.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.trackToParticipant.clear();
    this.sequence = 0;

    if (this.room) {
      try {
        this.room.disconnect();
      } catch (error) {
        this.logger.error("Error disconnecting audio tap room", error);
      }
      this.room = null;
    }

    this.logger.log("AudioTapAgent stopped");
  }

  /**
   * Whether the agent is currently connected and running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the current track-to-participant mappings.
   */
  getTrackParticipants(): Map<string, string> {
    return new Map(this.trackToParticipant);
  }
}
