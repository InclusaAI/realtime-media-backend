import { Controller, Logger } from "@nestjs/common";
import { EventPattern, Payload } from "@nestjs/microservices";
import { AudioTapService } from "../audio-tap/audio-tap.service";
import { EgressService } from "../egress/egress.service";

/**
 * Handles Kafka events for session lifecycle management.
 * Listens for session.created and session.ended events from the platform backend.
 *
 * session.created → Pre-warm media resources (start media tap for the room)
 * session.ended → Cleanup all room resources (audio taps, egress, video)
 */
@Controller()
export class SessionEventController {
  private readonly logger = new Logger(SessionEventController.name);

  constructor(
    private readonly audioTapService: AudioTapService,
    private readonly egressService: EgressService,
  ) {}

  @EventPattern("session.created")
  async handleSessionCreated(
    @Payload()
    data: {
      roomName: string;
      sessionId?: string;
      initiatorId?: string;
      mode?: string;
    },
  ): Promise<void> {
    this.logger.log(
      `Session created event received for room: ${data.roomName}`,
    );

    // Pre-warm: start media tap (audio + video) for this room
    // This ensures we're ready when participants start publishing
    try {
      await this.audioTapService.startAudioTap(data.roomName);
      this.logger.log(
        `Media tap started for newly created session: ${data.roomName}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start media tap for session ${data.roomName}`,
        error,
      );
    }
  }

  @EventPattern("session.ended")
  async handleSessionEnded(
    @Payload() data: { roomName: string; sessionId?: string },
  ): Promise<void> {
    this.logger.log(
      `Session ended event received for room: ${data.roomName}`,
    );

    // Cleanup: stop audio taps, video egress, and all room resources
    try {
      await this.audioTapService.stopAudioTap(data.roomName);
      await this.egressService.stopAllForRoom(data.roomName);
      this.logger.log(
        `Cleaned up resources for ended session: ${data.roomName}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to cleanup resources for session ${data.roomName}`,
        error,
      );
    }
  }
}
