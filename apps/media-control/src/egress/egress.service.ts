import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { LiveKitAdapterService } from "../sfu-adapter/livekit-adapter.service";
import { VideoFrameHandler } from "./video-frame.handler";

/**
 * Quality level for video egress.
 * Adjusts sampling rate based on bandwidth/constraints.
 */
export type VideoQuality = "low" | "medium" | "high";

/**
 * Quality profiles: maps quality level to target FPS.
 */
const QUALITY_PROFILES: Record<VideoQuality, number> = {
  low: 5,
  medium: 10,
  high: 15,
};

/**
 * Tracks an active egress session for a specific track in a room.
 */
interface ActiveEgress {
  roomName: string;
  trackSid: string;
  kind: "audio" | "video";
  startedAt: Date;
  status: "pending" | "active" | "stopped" | "error";
  /** For video tracks: current quality level */
  quality?: VideoQuality;
}

/**
 * Manages media egress (extraction) sessions.
 * Tracks which rooms/tracks are being egressed and provides lifecycle management.
 *
 * Supports both audio and video egress with quality adaptation for video.
 */
@Injectable()
export class EgressService implements OnModuleDestroy {
  private readonly logger = new Logger(EgressService.name);
  private readonly activeEgresses: Map<string, ActiveEgress> = new Map();

  constructor(
    private readonly sfuAdapter: LiveKitAdapterService,
    private readonly videoFrameHandler: VideoFrameHandler
  ) {}

  /**
   * Start egress for a specific track in a room.
   * @param roomName - LiveKit room name
   * @param trackSid - track SID to capture
   * @param kind - "audio" or "video" (default: "audio")
   * @param websocketUrl - optional WebSocket URL to stream data to
   * @returns egress ID and status
   */
  async startEgress(
    roomName: string,
    trackSid: string,
    kind: "audio" | "video" = "audio",
    websocketUrl?: string
  ): Promise<{ egressId: string; status: string }> {
    const egressKey = this.getEgressKey(roomName, trackSid);

    if (this.activeEgresses.has(egressKey)) {
      this.logger.debug(
        `Egress already active for track ${trackSid} in room ${roomName}`
      );
      const existing = this.activeEgresses.get(egressKey)!;
      return { egressId: egressKey, status: existing.status };
    }

    try {
      await this.sfuAdapter.startEgress(roomName, trackSid, websocketUrl);

      const egress: ActiveEgress = {
        roomName,
        trackSid,
        kind,
        startedAt: new Date(),
        status: "active",
        quality: kind === "video" ? "high" : undefined,
      };
      this.activeEgresses.set(egressKey, egress);

      this.logger.log(
        `Egress started for ${kind} track ${trackSid} in room ${roomName}`
      );
      return { egressId: egressKey, status: "active" };
    } catch (error) {
      const egress: ActiveEgress = {
        roomName,
        trackSid,
        kind,
        startedAt: new Date(),
        status: "error",
      };
      this.activeEgresses.set(egressKey, egress);

      this.logger.error(
        `Failed to start egress for ${kind} track ${trackSid} in room ${roomName}`,
        error
      );
      return { egressId: egressKey, status: "error" };
    }
  }

  /**
   * Start video egress for a specific track with quality control.
   * @param roomName - LiveKit room name
   * @param trackSid - video track SID to capture
   * @param websocketUrl - WebSocket URL to stream video data to
   * @param quality - initial quality level (default: "high" = 15fps)
   */
  async startVideoEgress(
    roomName: string,
    trackSid: string,
    websocketUrl: string,
    quality: VideoQuality = "high"
  ): Promise<{ egressId: string; status: string; quality: VideoQuality }> {
    const result = await this.startEgress(roomName, trackSid, "video", websocketUrl);
    return { ...result, quality };
  }

  /**
   * Adapt video quality for an active egress session.
   * Useful for bandwidth-constrained scenarios.
   */
  adaptQuality(
    roomName: string,
    trackSid: string,
    newQuality: VideoQuality
  ): { success: boolean; previousQuality?: VideoQuality; fps?: number } {
    const egressKey = this.getEgressKey(roomName, trackSid);
    const egress = this.activeEgresses.get(egressKey);

    if (!egress) {
      this.logger.warn(
        `Cannot adapt quality: no active egress for track ${trackSid} in room ${roomName}`
      );
      return { success: false };
    }

    if (egress.kind !== "video") {
      this.logger.warn(
        `Cannot adapt quality for non-video track ${trackSid}`
      );
      return { success: false };
    }

    const previousQuality = egress.quality || "high";
    egress.quality = newQuality;
    const fps = QUALITY_PROFILES[newQuality];

    this.logger.log(
      `Video quality adapted for track ${trackSid} in room ${roomName}: ${previousQuality} -> ${newQuality} (${fps}fps)`
    );

    return { success: true, previousQuality, fps };
  }

  /**
   * Stop egress for a specific track.
   */
  async stopEgress(roomName: string, trackSid: string): Promise<void> {
    const egressKey = this.getEgressKey(roomName, trackSid);
    const egress = this.activeEgresses.get(egressKey);

    if (egress) {
      egress.status = "stopped";
      this.activeEgresses.delete(egressKey);

      // Clean up video metrics if it was a video track
      if (egress.kind === "video") {
        this.videoFrameHandler.cleanupRoom(roomName);
      }

      this.logger.log(
        `Egress stopped for ${egress.kind} track ${trackSid} in room ${roomName}`
      );
    }
  }

  /**
   * Stop all egress sessions for a room.
   */
  async stopAllForRoom(roomName: string): Promise<void> {
    const toRemove: string[] = [];
    for (const [key, egress] of this.activeEgresses) {
      if (egress.roomName === roomName) {
        egress.status = "stopped";
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      this.activeEgresses.delete(key);
    }
    if (toRemove.length > 0) {
      this.logger.log(
        `Stopped ${toRemove.length} egress sessions for room ${roomName}`
      );
      this.videoFrameHandler.cleanupRoom(roomName);
    }
  }

  /**
   * Get the status of all active egress sessions.
   */
  getActiveEgresses(): ActiveEgress[] {
    return Array.from(this.activeEgresses.values());
  }

  /**
   * Get active egresses for a specific room.
   */
  getEgressesForRoom(roomName: string): ActiveEgress[] {
    return this.getActiveEgresses().filter((e) => e.roomName === roomName);
  }

  /**
   * Get the count of active egresses.
   */
  getActiveEgressCount(): number {
    return this.activeEgresses.size;
  }

  /**
   * Get the count of active video egresses.
   */
  getActiveVideoEgressCount(): number {
    return this.getActiveEgresses().filter((e) => e.kind === "video").length;
  }

  /**
   * Get quality profiles (for documentation).
   */
  getQualityProfiles(): Record<VideoQuality, number> {
    return { ...QUALITY_PROFILES };
  }

  private getEgressKey(roomName: string, trackSid: string): string {
    return `${roomName}::${trackSid}`;
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log(
      `Stopping ${this.activeEgresses.size} active egress sessions`
    );
    for (const egress of this.activeEgresses.values()) {
      egress.status = "stopped";
    }
    this.activeEgresses.clear();
  }
}
