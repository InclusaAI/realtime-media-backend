import { Injectable, Logger, Inject } from "@nestjs/common";
import { ClientKafka } from "@nestjs/microservices";

/**
 * Metrics for video frame processing.
 */
export interface VideoMetrics {
  framesReceived: number;
  framesPublished: number;
  framesDropped: number;
  publishFailures: number;
  lastFrameAt: Date | null;
  currentFps: number;
  targetFps: number;
  errors: string[];
}

interface FrameTimestamp {
  lastPublishedAt: number;
  frameCount: number;
  windowStart: number;
}

/**
 * Handles raw video data arriving from LiveKit Egress WebSocket.
 *
 * LiveKit Egress streams raw video track data to a WebSocket endpoint.
 * This handler receives those frames, samples them at the target FPS
 * (15fps per ADR-0007), and publishes them to Kafka for downstream
 * AI services (sign recognition).
 *
 * LiveKit video egress binary message format:
 * - 4-byte big-endian payload length
 * - Remaining bytes: video payload (H264/VP8/VP9 encoded)
 *
 * Backpressure: If Kafka publish fails, frames are dropped with
 * metrics tracking. No buffering to prevent memory overflow.
 */
@Injectable()
export class VideoFrameHandler {
  private readonly logger = new Logger(VideoFrameHandler.name);

  /** Target frames per second for sampling */
  private readonly TARGET_FPS = 15;

  /** Minimum interval between published frames (ms) */
  private readonly FRAME_INTERVAL_MS = 1000 / this.TARGET_FPS;

  /** Sequence counter per room/track */
  private readonly sequences: Map<string, number> = new Map();

  /** Track-to-participant mapping (trackSid -> participantIdentity) */
  private readonly trackParticipants: Map<string, string> = new Map();

  /** Metrics per room */
  private readonly metrics: Map<string, VideoMetrics> = new Map();

  /** Frame timing for FPS sampling per room/track */
  private readonly frameTiming: Map<string, FrameTimestamp> = new Map();

  constructor(
    @Inject("KAFKA_SERVICE") private readonly kafkaClient: ClientKafka
  ) {}

  /**
   * Register a track-to-participant mapping.
   * Called by AudioTapAgent (or VideoTapAgent) when a track is subscribed.
   */
  setTrackParticipant(trackSid: string, participantIdentity: string): void {
    this.trackParticipants.set(trackSid, participantIdentity);
  }

  /**
   * Remove a track mapping.
   */
  removeTrack(trackSid: string): void {
    this.trackParticipants.delete(trackSid);
    // Clean up timing data
    for (const key of this.frameTiming.keys()) {
      if (key.endsWith(`::${trackSid}`)) {
        this.frameTiming.delete(key);
      }
    }
  }

  /**
   * Process a raw video message from LiveKit Egress WebSocket.
   *
   * Applies FPS-based sampling: only publishes frames that meet the
   * minimum interval threshold (66.67ms for 15fps).
   *
   * @param roomName - the LiveKit room name
   * @param trackSid - the track SID this data belongs to
   * @param data - raw binary data from the WebSocket
   */
  processVideoFrame(
    roomName: string,
    trackSid: string,
    data: Buffer
  ): void {
    const metrics = this.getMetrics(roomName);
    metrics.framesReceived++;
    metrics.lastFrameAt = new Date();

    try {
      // Parse the LiveKit Egress WebSocket binary message format:
      // 4-byte big-endian payload length, followed by payload
      if (data.length < 4) {
        this.logger.warn(
          `Video frame too small (${data.length} bytes) for track ${trackSid}`
        );
        return;
      }

      const payloadSize = data.readUInt32BE(0);
      const payload = data.subarray(4, 4 + payloadSize);

      if (payload.length !== payloadSize) {
        this.logger.warn(
          `Video frame payload size mismatch: expected ${payloadSize}, got ${payload.length}`
        );
        return;
      }

      // FPS sampling — drop frames that arrive too fast
      const timingKey = `${roomName}::${trackSid}`;
      const now = Date.now();
      const timing = this.frameTiming.get(timingKey);

      if (timing) {
        const elapsed = now - timing.lastPublishedAt;
        if (elapsed < this.FRAME_INTERVAL_MS) {
          // Frame arrived too early — drop it
          metrics.framesDropped++;
          return;
        }
        // Update FPS calculation (rolling window of 1 second)
        timing.frameCount++;
        if (now - timing.windowStart >= 1000) {
          metrics.currentFps = timing.frameCount;
          timing.frameCount = 0;
          timing.windowStart = now;
        }
      } else {
        this.frameTiming.set(timingKey, {
          lastPublishedAt: now,
          frameCount: 1,
          windowStart: now,
        });
      }

      if (timing) {
        timing.lastPublishedAt = now;
      }

      // Get sequence number for this track
      const seqKey = `${roomName}::${trackSid}`;
      const sequence = (this.sequences.get(seqKey) || 0) + 1;
      this.sequences.set(seqKey, sequence);

      // Resolve speaker identity
      const speakerId =
        this.trackParticipants.get(trackSid) || "unknown";

      // Detect video codec from payload header
      const codec = this.detectVideoCodec(payload);

      // Build the Kafka message matching the AI services contract
      const message = {
        speakerId,
        sequence,
        timestamp: new Date().toISOString(),
        frameData: payload.toString("base64"),
        codec,
        width: 0, // Will be populated if we parse resolution headers
        height: 0,
        frameNumber: sequence,
        trackSid,
        roomName,
      };

      // Publish to Kafka
      this.kafkaClient.emit(
        `media.session.${roomName}.video.frame`,
        message
      );

      metrics.framesPublished++;

      this.logger.debug(
        `Video frame published: room=${roomName} track=${trackSid} seq=${sequence} size=${payload.length} codec=${codec}`
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
        `Failed to process video frame for track ${trackSid} in room ${roomName}`,
        error
      );
    }
  }

  /**
   * Detect video codec from the first bytes of the payload.
   * Common LiveKit codecs: H264, VP8, VP9, AV1
   */
  private detectVideoCodec(payload: Buffer): string {
    if (payload.length < 2) return "unknown";

    // H264: NAL unit type 1-5 (non-VCL) or 19-28 (VCL)
    // Look for NAL header: 0x00 0x00 0x00 0x01 start code
    if (payload.length >= 4) {
      if (
        payload[0] === 0x00 &&
        payload[1] === 0x00 &&
        payload[2] === 0x00 &&
        payload[3] === 0x01
      ) {
        return "h264";
      }
    }

    // VP8: first byte of frame is typically 0x10 or 0x00
    if (payload[0] === 0x10 || payload[0] === 0x00) {
      return "vp8";
    }

    // VP9: check for VP9 superframe header
    if ((payload[0] & 0xe0) === 0xc0) {
      return "vp9";
    }

    return "unknown";
  }

  /**
   * Get metrics for a room.
   */
  getMetrics(roomName: string): VideoMetrics {
    if (!this.metrics.has(roomName)) {
      this.metrics.set(roomName, {
        framesReceived: 0,
        framesPublished: 0,
        framesDropped: 0,
        publishFailures: 0,
        lastFrameAt: null,
        currentFps: 0,
        targetFps: this.TARGET_FPS,
        errors: [],
      });
    }
    return this.metrics.get(roomName)!;
  }

  /**
   * Get metrics for all rooms.
   */
  getAllMetrics(): Record<string, VideoMetrics> {
    const result: Record<string, VideoMetrics> = {};
    for (const [room, metrics] of this.metrics) {
      result[room] = { ...metrics };
    }
    return result;
  }

  /**
   * Get the target FPS.
   */
  getTargetFps(): number {
    return this.TARGET_FPS;
  }

  /**
   * Cleanup metrics and timing for a room.
   */
  cleanupRoom(roomName: string): void {
    this.metrics.delete(roomName);
    // Clean up sequences for tracks in this room
    for (const key of this.sequences.keys()) {
      if (key.startsWith(`${roomName}::`)) {
        this.sequences.delete(key);
      }
    }
    // Clean up frame timing for tracks in this room
    for (const key of this.frameTiming.keys()) {
      if (key.startsWith(`${roomName}::`)) {
        this.frameTiming.delete(key);
      }
    }
  }
}
