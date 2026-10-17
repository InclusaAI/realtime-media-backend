import {
  Controller,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TrackType, WebhookReceiver } from 'livekit-server-sdk';
import { TrackDiscoveryService } from './track-discovery.service';

/**
 * Minimal request shape. `@types/express` is not a dependency, so `express`
 * types are intentionally not imported.
 */
type WebhookRequest = RawBodyRequest<{
  headers: Record<string, string | string[] | undefined>;
}>;

@Injectable()
export class WebhookReceiverFactory {
  private receiver: WebhookReceiver | null = null;
  private configured: WebhookReceiver | 'unconfigured' | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Build (and cache) the signature verifier.
   *
   * Throws {@link ServiceUnavailableException} when LiveKit credentials are
   * absent: an unverifiable webhook must never be trusted, so this fails closed
   * rather than accepting unsigned events.
   */
  get(): WebhookReceiver {
    if (this.configured === 'unconfigured') {
      throw new ServiceUnavailableException(
        'LiveKit webhook receiver not configured: LIVEKIT_API_KEY / ' +
          'LIVEKIT_API_SECRET are required to verify webhook signatures.',
      );
    }

    if (this.receiver) {
      return this.receiver;
    }

    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!apiKey || !apiSecret) {
      this.configured = 'unconfigured';
      throw new ServiceUnavailableException(
        'LiveKit webhook receiver not configured: LIVEKIT_API_KEY / ' +
          'LIVEKIT_API_SECRET are required to verify webhook signatures.',
      );
    }

    this.receiver = new WebhookReceiver(apiKey, apiSecret);
    this.configured = this.receiver;
    return this.receiver;
  }
}

/**
 * Receives LiveKit webhook callbacks for track lifecycle.
 *
 * Configure on the LiveKit server:
 *   URL:   https://<your-host>/api/livekit/webhook
 *   Keys:  the same LIVEKIT_API_KEY / LIVEKIT_API_SECRET this service uses
 *
 * Only the track-lifecycle events are acted on; Egress and Ingress events are
 * acknowledged and ignored. Every request is signature-verified — the JWT in the
 * `Authorization` header is validated against the raw request body.
 */
@Controller('api/livekit/webhook')
export class LiveKitWebhookController {
  private readonly logger = new Logger(LiveKitWebhookController.name);

  constructor(
    private readonly receiverFactory: WebhookReceiverFactory,
    private readonly trackDiscovery: TrackDiscoveryService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: WebhookRequest,
    @Headers('authorization') authorization?: string,
    @Headers('authorize') authorize?: string,
  ): Promise<{ received: string; handled: boolean }> {
    // The signature covers the exact bytes LiveKit signed, so the raw body is
    // mandatory — a re-serialised JSON object would not verify. This requires
    // `rawBody: true` on NestFactory.create() (see main.ts).
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException(
        'Raw request body unavailable; cannot verify webhook signature.',
      );
    }

    const authHeader = firstHeader(authorization) ?? firstHeader(authorize);
    if (!authHeader) {
      throw new UnauthorizedException('Missing LiveKit webhook Authorization header.');
    }

    let event;
    try {
      event = await this.receiverFactory.get().receive(rawBody.toString('utf8'), authHeader);
    } catch (error) {
      // Covers both a bad signature and misconfigured credentials. Never leak
      // the reason — it would help an attacker distinguish the two.
      this.logger.warn(
        `Rejected LiveKit webhook: ${(error as Error).message}`,
      );
      throw new UnauthorizedException('Invalid LiveKit webhook signature.');
    }

    return { received: event.event, handled: this.dispatch(event) };
  }

  /** @returns whether the event produced a track-lifecycle transition. */
  private dispatch(event: {
    event: string;
    room?: { name?: string };
    participant?: { identity?: string };
    track?: { sid?: string; type?: TrackType };
  }): boolean {
    const roomName = event.room?.name;
    const trackSid = event.track?.sid;
    const identity = event.participant?.identity;

    switch (event.event) {
      case 'track_published': {
        if (!roomName || !trackSid || !identity) {
          this.logger.warn(
            `track_published webhook missing room/track/participant: ${JSON.stringify(event)}`,
          );
          return false;
        }

        this.trackDiscovery.applyTrackPublished(
          roomName,
          trackSid,
          identity,
          toKind(event.track?.type),
        );
        return true;
      }

      case 'track_unpublished': {
        if (!roomName || !trackSid) {
          this.logger.warn(
            `track_unpublished webhook missing room/track: ${JSON.stringify(event)}`,
          );
          return false;
        }

        this.trackDiscovery.applyTrackUnpublished(roomName, trackSid);
        return true;
      }

      case 'participant_left': {
        if (!roomName || !identity) {
          this.logger.warn(
            `participant_left webhook missing room/participant: ${JSON.stringify(event)}`,
          );
          return false;
        }

        // LiveKit does not enumerate the tracks that went away with the
        // participant, so drop all of theirs.
        this.trackDiscovery.applyParticipantLeft(roomName, identity);
        return true;
      }

      case 'room_finished': {
        if (roomName) {
          this.trackDiscovery.detachRoom(roomName);
        }
        return true;
      }

      // room_started, participant_joined, participant_connection_aborted,
      // egress_*, ingress_* — acknowledged, not acted on.
      default:
        return false;
    }
  }
}

function toKind(type: TrackType | undefined): 'audio' | 'video' {
  return type === TrackType.AUDIO ? 'audio' : 'video';
}

function firstHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}