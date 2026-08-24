import { Controller, Logger } from "@nestjs/common";
import { EventPattern, Payload } from "@nestjs/microservices";
import { AudioTapService } from "../audio-tap/audio-tap.service";
import { EgressService } from "../egress/egress.service";

/**
 * Handles Kafka events for session lifecycle management.
 * Listens for session.created and session.ended events from the platform backend.
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
    @Payload() data: { roomName: string; sessionId?: string },
  ): Promise<void> {
    this.logger.log(
      `Session created event received for room: ${data.roomName}`,
    );

    // The room is created on LiveKit when the first participant joins,
    // but we can pre-warm resources here if needed.
    // For now, we log the event for observability.
  }

  @EventPattern("session.ended")
  async handleSessionEnded(
    @Payload() data: { roomName: string; sessionId?: string },
  ): Promise<void> {
    this.logger.log(
      `Session ended event received for room: ${data.roomName}`,
    );

    // Cleanup: stop audio taps and egress sessions for this room
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
