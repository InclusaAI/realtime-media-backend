import { Controller, Logger } from "@nestjs/common";
import { EventPattern, Payload } from "@nestjs/microservices";
import { AudioTapService } from "../audio-tap/audio-tap.service";
import { EgressService } from "../egress/egress.service";
import {
  SessionCreatedEvent,
  SessionEndedEvent,
  isValidSessionId,
  sessionTopics,
} from "../contracts/kafka-events";
import { KafkaAdminService } from "../kafka/kafka-admin.service";

/**
 * Handles Kafka events for session lifecycle management.
 * Listens for session.created and session.ended events from the platform-backend.
 *
 * session.created → Pre-warm media resources (start media tap for the room)
 * session.ended → Cleanup all room resources (audio taps, egress, video)
 *
 * The platform-backend's session-service is the source of truth for sessions.
 * It publishes these events when sessions are created/ended via its REST API.
 * This controller consumes them to manage media-layer resources.
 */
@Controller()
export class SessionEventController {
  private readonly logger = new Logger(SessionEventController.name);

  constructor(
    private readonly audioTapService: AudioTapService,
    private readonly egressService: EgressService,
    private readonly kafkaAdmin: KafkaAdminService,
  ) {}

  /**
   * Consume session.created from platform-backend.
   * Payload matches backend/libs/kafka-contracts/src/sessions.ts::SessionCreatedPayload
   *
   * Uses sessionId as the LiveKit room name (1:1 mapping).
   */
  @EventPattern("session.created")
  async handleSessionCreated(
    @Payload() data: SessionCreatedEvent,
  ): Promise<void> {
    // sessionId from platform-backend is the Prisma cuid, used as room name
    const roomName = data.sessionId;

    this.logger.log(
      `Session created event received: sessionId=${roomName} presentationId=${data.presentationId}`,
    );

    // The sessionId reaches us over the wire and is interpolated into topic
    // names, so refuse anything that is not a plain identifier before doing
    // any work with it.
    if (!isValidSessionId(roomName)) {
      this.logger.error(
        `Rejecting session.created with invalid sessionId: ${JSON.stringify(roomName)}. ` +
          'Expected letters, digits, "-" or "_" only.',
      );
      return;
    }

    // Provision this session's topics before anything publishes to them.
    // Managed brokers have auto-creation off, so skipping this would make every
    // later emit() fail with UNKNOWN_TOPIC_OR_PARTITION.
    await this.kafkaAdmin.ensureTopics(sessionTopics(roomName));

    // Pre-warm: start media tap (audio + video) for this room
    // This ensures we're ready when participants start publishing
    try {
      await this.audioTapService.startAudioTap(roomName);
      this.logger.log(
        `Media tap started for newly created session: ${roomName}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start media tap for session ${roomName}`,
        error,
      );
    }
  }

  /**
   * Consume session.ended from platform-backend.
   * Payload matches backend/libs/kafka-contracts/src/sessions.ts::SessionEndedPayload
   */
  @EventPattern("session.ended")
  async handleSessionEnded(
    @Payload() data: SessionEndedEvent,
  ): Promise<void> {
    const roomName = data.sessionId;

    this.logger.log(
      `Session ended event received: sessionId=${roomName}`,
    );

    // Cleanup: stop audio taps, video egress, and all room resources
    try {
      await this.audioTapService.stopAudioTap(roomName);
      await this.egressService.stopAllForRoom(roomName);
      this.logger.log(
        `Cleaned up resources for ended session: ${roomName}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to cleanup resources for session ${roomName}`,
        error,
      );
    }
  }
}
