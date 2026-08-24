import { Injectable, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { ClientKafka } from "@nestjs/microservices";

/**
 * Metrics for audio chunk processing.
 */
export interface AudioMetrics {
  chunksReceived: number;
  chunksPublished: number;
  publishFailures: number;
  lastChunkAt: Date | null;
  errors: string[];
}

/**
 * Handles raw audio data arriving from LiveKit Egress WebSocket.
 *
 * LiveKit Egress streams raw track data (Opus/PCM frames) to a WebSocket
 * endpoint. This handler receives those frames, enriches them with metadata,
 * and publishes them to Kafka for downstream AI services (ASR).
 *
 * Protocol: LiveKit Egress WebSocket sends binary messages containing
 * audio packet data with the following structure:
 * - First 4 bytes: payload size (big-endian uint32)
 * - Remaining bytes: audio payload (Opus encoded)
 */
@Injectable()
export class AudioChunkHandler {
  private readonly logger = new Logger(AudioChunkHandler.name);

  /** Sequence counter per room/track */
  private readonly sequences: Map<string, number> = new Map();

  /** Track-to-participant mapping (trackSid -> participantIdentity) */
  private readonly trackParticipants: Map<string, string> = new Map();

  /** Metrics per room */
  private readonly metrics: Map<string, AudioMetrics> = new Map();

  constructor(
    @Inject("KAFKA_SERVICE") private readonly kafkaClient: ClientKafka,
  ) {}

  /**
   * Register a track-to-participant mapping.
   * Called by AudioTapAgent when a track is subscribed.
   */
  setTrackParticipant(trackSid: string, participantIdentity: string): void {
    this.trackParticipants.set(trackSid, participantIdentity);
  }

  /**
   * Remove a track mapping.
   * Called when a track is unsubscribed.
   */
  removeTrack(trackSid: string): void {
    this.trackParticipants.delete(trackSid);
  }

  /**
   * Process a raw audio message from LiveKit Egress WebSocket.
   *
   * @param roomName - the LiveKit room name
   * @param trackSid - the track SID this data belongs to
   * @param data - raw binary data from the WebSocket
   */
  processAudioFrame(roomName: string, trackSid: string, data: Buffer): void {
    const metrics = this.getMetrics(roomName);
    metrics.chunksReceived++;
    metrics.lastChunkAt = new Date();

    try {
      // Parse the LiveKit Egress WebSocket binary message format:
      // 4-byte big-endian payload length, followed by payload
      if (data.length < 4) {
        this.logger.warn(
          `Audio frame too small (${data.length} bytes) for track ${trackSid}`,
        );
        return;
      }

      const payloadSize = data.readUInt32BE(0);
      const payload = data.subarray(4, 4 + payloadSize);

      if (payload.length !== payloadSize) {
        this.logger.warn(
          `Audio frame payload size mismatch: expected ${payloadSize}, got ${payload.length}`,
        );
        return;
      }

      // Get sequence number for this track
      const seqKey = `${roomName}::${trackSid}`;
      const sequence = (this.sequences.get(seqKey) || 0) + 1;
      this.sequences.set(seqKey, sequence);

      // Resolve speaker identity
      const speakerId =
        this.trackParticipants.get(trackSid) || "unknown";

      // Build the Kafka message matching the AI services contract
      const message = {
        speakerId,
        sequence,
        timestamp: new Date().toISOString(),
        audioData: payload.toString("base64"),
        encoding: "opus",
        sampleRate: 48000,
        channels: 1,
        trackSid,
        roomName,
      };

      // Publish to Kafka
      this.kafkaClient.emit(
        `media.session.${roomName}.audio.chunk`,
        message,
      );

      metrics.chunksPublished++;

      this.logger.debug(
        `Audio chunk published: room=${roomName} track=${trackSid} seq=${sequence} size=${payload.length}`,
      );
    } catch (error) {
      metrics.publishFailures++;
      const errMsg = (error as Error).message;
      metrics.errors.push(errMsg);

      // Keep only last 10 errors
      if (metrics.errors.length > 10) {
        metrics.errors = metrics.errors.slice(-10);
      }

      this.logger.error(
        `Failed to process audio frame for track ${trackSid} in room ${roomName}`,
        error,
      );
    }
  }

  /**
   * Get metrics for a room.
   */
  getMetrics(roomName: string): AudioMetrics {
    if (!this.metrics.has(roomName)) {
      this.metrics.set(roomName, {
        chunksReceived: 0,
        chunksPublished: 0,
        publishFailures: 0,
        lastChunkAt: null,
        errors: [],
      });
    }
    return this.metrics.get(roomName)!;
  }

  /**
   * Get metrics for all rooms.
   */
  getAllMetrics(): Record<string, AudioMetrics> {
    const result: Record<string, AudioMetrics> = {};
    for (const [room, metrics] of this.metrics) {
      result[room] = { ...metrics };
    }
    return result;
  }

  /**
   * Cleanup metrics for a room.
   */
  cleanupRoom(roomName: string): void {
    this.metrics.delete(roomName);
    // Also clean up sequences for tracks in this room
    for (const key of this.sequences.keys()) {
      if (key.startsWith(`${roomName}::`)) {
        this.sequences.delete(key);
      }
    }
  }
}
