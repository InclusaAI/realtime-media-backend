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
 * MediaTapAgent connects to a LiveKit room as a subscriber,
 * captures audio and video tracks from participants, and publishes
 * metadata to Kafka for downstream AI services.
 *
 * Architecture:
 * - Subscribes to all audio AND video tracks in a room
 * - Tracks which participant owns each track (trackSid -> identity)
 * - Publishes metadata (speakerId, trackSid, kind) to Kafka
 * - Actual media data flows via LiveKit Egress -> WebSocket -> AudioChunkHandler/VideoFrameHandler
 *
 * The agent handles the LiveKit SDK connection and track management.
 * Raw media processing is delegated to handlers via the Egress pipeline.
 */
export class MediaTapAgent {
  private readonly logger = new Logger(MediaTapAgent.name);
  private room: Room | null = null;
  private trackToParticipant: Map<string, string> = new Map();
  private trackToKind: Map<string, "audio" | "video"> = new Map();
  private sequence: number = 0;
  private running: boolean = false;

  /** Callback when a new track is subscribed */
  onTrackSubscribed?: (
    roomName: string,
    trackSid: string,
    participantIdentity: string,
    kind: "audio" | "video",
  ) => void;

  /** Callback when a track is unsubscribed */
  onTrackUnsubscribed?: (trackSid: string, kind: "audio" | "video") => void;

  constructor(
    private readonly serverUrl: string,
    private readonly kafkaClient: ClientKafka,
  ) {}

  /**
   * Connect to the room and start capturing audio + video tracks.
   * @param roomName - LiveKit room name to join
   * @param token - access token for authentication
   */
  async start(roomName: string, token: string): Promise<void> {
    if (this.running) {
      this.logger.warn("MediaTapAgent already running");
      return;
    }

    this.room = new Room({
      adaptiveStream: false,
      dynacast: false,
    });

    // Handle new track subscriptions (audio + video)
    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        const trackSid = track.sid;
        const participantIdentity = participant.identity;
        const kind: "audio" | "video" =
          track.kind === Track.Kind.Audio ? "audio" : "video";

        this.logger.log(
          `Subscribed to ${kind} track ${trackSid} from ${participantIdentity} in room ${roomName}`,
        );

        this.trackToParticipant.set(trackSid, participantIdentity);
        this.trackToKind.set(trackSid, kind);

        // Notify callback (used by AudioTapService to start egress)
        this.onTrackSubscribed?.(
          roomName,
          trackSid,
          participantIdentity,
          kind,
        );

        // Publish track metadata event to Kafka
        this.publishTrackEvent(
          roomName,
          trackSid,
          participantIdentity,
          kind,
          "track_subscribed",
        );
      },
    );

    // Handle track unsubscriptions
    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      const trackSid = track.sid;
      const participantIdentity =
        this.trackToParticipant.get(trackSid) || "unknown";
      const kind = this.trackToKind.get(trackSid) || "audio";

      this.logger.log(
        `${kind} track ${trackSid} unsubscribed from ${participantIdentity}`,
      );

      this.trackToParticipant.delete(trackSid);
      this.trackToKind.delete(trackSid);
      this.onTrackUnsubscribed?.(trackSid, kind);
    });

    // Handle disconnection
    this.room.on(RoomEvent.Disconnected, () => {
      this.logger.warn(`Media tap disconnected from room ${roomName}`);
      this.running = false;
    });

    // Handle reconnection
    this.room.on(RoomEvent.Reconnected, () => {
      this.logger.log(`Media tap reconnected to room ${roomName}`);
      this.running = true;
    });

    this.room.on(RoomEvent.Connected, () => {
      this.logger.log(`Media tap connected to room ${roomName}`);
    });

    try {
      await this.room.connect(this.serverUrl, token);
      this.running = true;
      this.logger.log(`MediaTapAgent started for room ${roomName}`);
    } catch (error) {
      this.logger.error(
        `Failed to connect MediaTapAgent to room ${roomName}`,
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
  private publishTrackEvent(
    roomName: string,
    trackSid: string,
    participantIdentity: string,
    kind: "audio" | "video",
    event: string,
  ): void {
    this.sequence++;

    const message = {
      event,
      speakerId: participantIdentity,
      trackSid,
      kind,
      sequence: this.sequence,
      timestamp: new Date().toISOString(),
      roomName,
    };

    // Publish to kind-specific metadata topic
    this.kafkaClient.emit(
      `media.session.${roomName}.${kind}.metadata`,
      message,
    );
  }

  /**
   * Stop the agent, disconnect from the room, and clean up resources.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.trackToParticipant.clear();
    this.trackToKind.clear();
    this.sequence = 0;

    if (this.room) {
      try {
        this.room.disconnect();
      } catch (error) {
        this.logger.error("Error disconnecting media tap room", error);
      }
      this.room = null;
    }

    this.logger.log("MediaTapAgent stopped");
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

  /**
   * Get the kind (audio/video) for a track.
   */
  getTrackKind(trackSid: string): "audio" | "video" | undefined {
    return this.trackToKind.get(trackSid);
  }
}

/**
 * @deprecated Use MediaTapAgent instead. This alias is kept for backward compatibility.
 */
export const AudioTapAgent = MediaTapAgent;
