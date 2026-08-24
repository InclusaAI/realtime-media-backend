import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { LiveKitAdapterService } from "../sfu-adapter/livekit-adapter.service";

/**
 * Tracks an active egress session for a specific track in a room.
 */
interface ActiveEgress {
  roomName: string;
  trackSid: string;
  startedAt: Date;
  status: "pending" | "active" | "stopped" | "error";
}

/**
 * Manages media egress (extraction) sessions.
 * Tracks which rooms/tracks are being egressed and provides lifecycle management.
 */
@Injectable()
export class EgressService implements OnModuleDestroy {
  private readonly logger = new Logger(EgressService.name);
  private readonly activeEgresses: Map<string, ActiveEgress> = new Map();

  constructor(private readonly sfuAdapter: LiveKitAdapterService) {}

  /**
   * Start egress for a specific track in a room.
   * Returns an egress ID that can be used to stop or query status.
   */
  async startEgress(
    roomName: string,
    trackSid: string,
  ): Promise<{ egressId: string; status: string }> {
    const egressKey = this.getEgressKey(roomName, trackSid);

    if (this.activeEgresses.has(egressKey)) {
      this.logger.debug(
        `Egress already active for track ${trackSid} in room ${roomName}`,
      );
      const existing = this.activeEgresses.get(egressKey)!;
      return { egressId: egressKey, status: existing.status };
    }

    try {
      await this.sfuAdapter.startEgress(roomName, trackSid);

      const egress: ActiveEgress = {
        roomName,
        trackSid,
        startedAt: new Date(),
        status: "active",
      };
      this.activeEgresses.set(egressKey, egress);

      this.logger.log(
        `Egress started for track ${trackSid} in room ${roomName}`,
      );
      return { egressId: egressKey, status: "active" };
    } catch (error) {
      const egress: ActiveEgress = {
        roomName,
        trackSid,
        startedAt: new Date(),
        status: "error",
      };
      this.activeEgresses.set(egressKey, egress);

      this.logger.error(
        `Failed to start egress for track ${trackSid} in room ${roomName}`,
        error,
      );
      return { egressId: egressKey, status: "error" };
    }
  }

  /**
   * Stop egress for a specific track.
   */
  async stopEgress(
    roomName: string,
    trackSid: string,
  ): Promise<void> {
    const egressKey = this.getEgressKey(roomName, trackSid);
    const egress = this.activeEgresses.get(egressKey);

    if (egress) {
      egress.status = "stopped";
      this.activeEgresses.delete(egressKey);
      this.logger.log(
        `Egress stopped for track ${trackSid} in room ${roomName}`,
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
        `Stopped ${toRemove.length} egress sessions for room ${roomName}`,
      );
    }
  }

  /**
   * Get the status of all active egress sessions.
   */
  getActiveEgresses(): ActiveEgress[] {
    return Array.from(this.activeEgresses.values());
  }

  /**
   * Get the count of active egresses.
   */
  getActiveEgressCount(): number {
    return this.activeEgresses.size;
  }

  private getEgressKey(roomName: string, trackSid: string): string {
    return `${roomName}::${trackSid}`;
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log(
      `Stopping ${this.activeEgresses.size} active egress sessions`,
    );
    for (const egress of this.activeEgresses.values()) {
      egress.status = "stopped";
    }
    this.activeEgresses.clear();
  }
}
