import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiveKitAdapterService } from '../sfu-adapter/livekit-adapter.service';
import { DiscoveredTrack } from '../sfu-adapter/interfaces/sfu-adapter.interface';
import { ClientKafka } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { Topics } from '../contracts/kafka-events';

const DEFAULT_POLL_INTERVAL_MS = 1000;

interface RoomTrackState {
  /** Current track ownership: trackSid -> { identity, kind }. */
  tracks: Map<string, { identity: string; kind: 'audio' | 'video' }>;
  /** Active poll timer, when webhooks are disabled. */
  pollTimer?: NodeJS.Timeout;
  /** Guards against overlapping polls when the API call outlives the interval. */
  pollInFlight: boolean;
  sequence: number;
}

/**
 * Discovers which participant owns which track, per room.
 *
 * Replaces the previous `MediaTapAgent`, which joined each room as a LiveKit
 * *participant* using the browser SDK. That could not work here: `livekit-client`
 * needs a browser WebRTC stack and fails in Node with "LiveKit doesn't seem to be
 * supported on this browser". It was also unnecessary — the agent never touched
 * media. Egress extracts the media itself; the agent's only output was the
 * track -> participant mapping used to start Egress per track.
 *
 * Two discovery sources, both driving the same diff-based state:
 *
 *   1. **Webhooks** (`LIVEKIT_WEBHOOKS_ENABLED=true`, the default in deployed
 *      environments). LiveKit POSTs `track_published` / `track_unpublished` /
 *      `participant_left` to `/api/livekit/webhook`; `LiveKitWebhookController`
 *      verifies the signature and calls `applySnapshot`-equivalent updates here.
 *      Push-based, so no latency and no polling cost.
 *
 *   2. **Polling** (default in local dev, where LiveKit cannot reach a public
 *      webhook URL). `listTracks()` is diffed against current state every
 *      `TRACK_POLL_INTERVAL_MS`.
 *
 * Because both paths converge on the same idempotent state transitions, leaving
 * both enabled is safe — the second source observes no change and emits nothing.
 */
@Injectable()
export class TrackDiscoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrackDiscoveryService.name);
  private readonly rooms = new Map<string, RoomTrackState>();

  private readonly webhooksEnabled: boolean;
  private readonly pollIntervalMs: number;

  /** Invoked when a track appears. Set by AudioTapService. */
  onTrackPublished?: (
    roomName: string,
    trackSid: string,
    participantIdentity: string,
    kind: 'audio' | 'video',
  ) => void | Promise<void>;

  /** Invoked when a track disappears. Set by AudioTapService. */
  onTrackUnpublished?: (
    roomName: string,
    trackSid: string,
    kind: 'audio' | 'video',
  ) => void | Promise<void>;

  constructor(
    private readonly sfuAdapter: LiveKitAdapterService,
    private readonly configService: ConfigService,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {
    this.webhooksEnabled =
      this.configService.get<string>('LIVEKIT_WEBHOOKS_ENABLED') === 'true';

    const configured = Number(
      this.configService.get<string>('TRACK_POLL_INTERVAL_MS'),
    );
    this.pollIntervalMs =
      Number.isInteger(configured) && configured > 0
        ? configured
        : DEFAULT_POLL_INTERVAL_MS;
  }

  onModuleInit(): void {
    this.logger.log(
      this.webhooksEnabled
        ? `Track discovery: LiveKit webhooks enabled (polling fallback also active at ${this.pollIntervalMs}ms)`
        : `Track discovery: polling every ${this.pollIntervalMs}ms ` +
          '(set LIVEKIT_WEBHOOKS_ENABLED=true once LiveKit can reach ' +
          '/api/livekit/webhook)',
    );
  }

  /** Start discovering tracks for a room. Idempotent. */
  attachRoom(roomName: string): void {
    if (this.rooms.has(roomName)) {
      return;
    }

    this.rooms.set(roomName, { tracks: new Map(), pollInFlight: false, sequence: 0 });
    this.startPolling(roomName);
  }

  /** Stop discovering tracks for a room and drop its state. */
  detachRoom(roomName: string): void {
    const state = this.rooms.get(roomName);
    if (!state) {
      return;
    }

    this.stopPolling(roomName);

    // Release every track so downstream Egress/handlers clean up.
    for (const [trackSid, { kind }] of state.tracks) {
      this.emitUnpublished(roomName, trackSid, kind);
    }

    state.tracks.clear();
    this.rooms.delete(roomName);
  }

  /**
   * Apply a webhook-delivered track publication.
   *
   * Idempotent: re-delivering the same event (LiveKit retries) is a no-op.
   */
  applyTrackPublished(
    roomName: string,
    trackSid: string,
    participantIdentity: string,
    kind: 'audio' | 'video',
  ): void {
    const state = this.ensureRoom(roomName);
    if (state.tracks.has(trackSid)) {
      return;
    }

    state.tracks.set(trackSid, { identity: participantIdentity, kind });
    this.logger.log(
      `${kind} track published: ${trackSid} from ${participantIdentity} in ${roomName}`,
    );
    this.publishMetadata(roomName, trackSid, participantIdentity, kind, 'track_subscribed');
    this.emitPublished(roomName, trackSid, participantIdentity, kind);
  }

  /**
   * Apply a webhook-delivered track unpublication (or a participant leaving,
   * which unpublishes all of their tracks).
   *
   * Idempotent.
   */
  applyTrackUnpublished(roomName: string, trackSid: string): void {
    const state = this.rooms.get(roomName);
    const existing = state?.tracks.get(trackSid);
    if (!state || !existing) {
      return;
    }

    state.tracks.delete(trackSid);
    this.logger.log(
      `${existing.kind} track unpublished: ${trackSid} in ${roomName}`,
    );
    this.emitUnpublished(roomName, trackSid, existing.kind);
  }

  /**
   * Drop every track belonging to a participant. Used for the
   * `participant_left` webhook, where LiveKit does not enumerate tracks.
   */
  applyParticipantLeft(roomName: string, participantIdentity: string): void {
    const state = this.rooms.get(roomName);
    if (!state) {
      return;
    }

    for (const [trackSid, { identity, kind }] of [...state.tracks]) {
      if (identity === participantIdentity) {
        state.tracks.delete(trackSid);
        this.logger.log(
          `${kind} track ${trackSid} removed with participant ${participantIdentity} in ${roomName}`,
        );
        this.emitUnpublished(roomName, trackSid, kind);
      }
    }
  }

  /** Current track ownership for a room. Used by tests and diagnostics. */
  getTracks(roomName: string): DiscoveredTrack[] {
    const state = this.rooms.get(roomName);
    if (!state) {
      return [];
    }

    return [...state.tracks.entries()].map(([trackSid, { identity, kind }]) => ({
      trackSid,
      participantIdentity: identity,
      kind,
    }));
  }

  getTrackedRoomCount(): number {
    return this.rooms.size;
  }

  // -------------------------------------------------------------------------
  // Polling
  // -------------------------------------------------------------------------

  private startPolling(roomName: string): void {
    const state = this.ensureRoom(roomName);
    if (state.pollTimer || this.rooms.size === 0) {
      return;
    }

    // Poll immediately so an already-populated room is picked up without
    // waiting a full interval.
    void this.pollRoom(roomName);

    state.pollTimer = setInterval(() => {
      void this.pollRoom(roomName);
    }, this.pollIntervalMs);

    // Never hold the event loop open on shutdown.
    state.pollTimer.unref?.();
  }

  private stopPolling(roomName: string): void {
    const state = this.rooms.get(roomName);
    if (state?.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = undefined;
    }
  }

  /**
   * Diff the room's current tracks against what we believe, emitting the
   * transitions. Errors are swallowed: a room that has not been created yet is
   * a normal state, not a failure.
   */
  private async pollRoom(roomName: string): Promise<void> {
    const state = this.rooms.get(roomName);
    if (!state || state.pollInFlight) {
      return;
    }

    state.pollInFlight = true;
    try {
      const discovered = await this.sfuAdapter.listTracks(roomName);
      this.applySnapshot(roomName, discovered);
    } catch (error) {
      // Do not log at error level: rooms are created by the SFU as participants
      // join, so "room not found" is routine before the first join.
      this.logger.debug(
        `Track poll for room ${roomName} failed: ${(error as Error).message}`,
      );
    } finally {
      if (state.pollInFlight === true) {
        state.pollInFlight = false;
      }
    }
  }

  /**
   * Reconcile known state against a full snapshot of the room's tracks.
   *
   * The shared reconciliation path for polling. Webhook application methods
   * bypass it because they already carry the exact transition.
   */
  private applySnapshot(roomName: string, discovered: DiscoveredTrack[]): void {
    const state = this.ensureRoom(roomName);
    const seen = new Set<string>();

    for (const track of discovered) {
      seen.add(track.trackSid);

      if (state.tracks.has(track.trackSid)) {
        continue;
      }

      state.tracks.set(track.trackSid, {
        identity: track.participantIdentity,
        kind: track.kind,
      });
      this.logger.log(
        `${track.kind} track discovered: ${track.trackSid} from ${track.participantIdentity} in ${roomName}`,
      );
      this.publishMetadata(
        roomName,
        track.trackSid,
        track.participantIdentity,
        track.kind,
        'track_subscribed',
      );
      this.emitPublished(
        roomName,
        track.trackSid,
        track.participantIdentity,
        track.kind,
      );
    }

    // Anything we hold that is no longer in the room has gone away.
    for (const [trackSid, { kind }] of [...state.tracks]) {
      if (seen.has(trackSid)) {
        continue;
      }

      state.tracks.delete(trackSid);
      this.logger.log(`${kind} track gone: ${trackSid} in ${roomName}`);
      this.emitUnpublished(roomName, trackSid, kind);
    }
  }

  private ensureRoom(roomName: string): RoomTrackState {
    let state = this.rooms.get(roomName);
    if (!state) {
      state = { tracks: new Map(), pollInFlight: false, sequence: 0 };
      this.rooms.set(roomName, state);
    }
    return state;
  }

  private async emitPublished(
    roomName: string,
    trackSid: string,
    participantIdentity: string,
    kind: 'audio' | 'video',
  ): Promise<void> {
    try {
      await this.onTrackPublished?.(
        roomName,
        trackSid,
        participantIdentity,
        kind,
      );
    } catch (error) {
      this.logger.error(
        `onTrackPublished handler failed for ${trackSid} in ${roomName}`,
        error,
      );
    }
  }

  private async emitUnpublished(
    roomName: string,
    trackSid: string,
    kind: 'audio' | 'video',
  ): Promise<void> {
    try {
      await this.onTrackUnpublished?.(roomName, trackSid, kind);
    } catch (error) {
      this.logger.error(
        `onTrackUnpublished handler failed for ${trackSid} in ${roomName}`,
        error,
      );
    }
  }

  /**
   * Publish track lifecycle metadata to Kafka.
   *
   * Field names are snake_case to match the inclusaai_contracts Python models.
   */
  private publishMetadata(
    roomName: string,
    trackSid: string,
    participantIdentity: string,
    kind: 'audio' | 'video',
    event: 'track_subscribed' | 'track_unsubscribed',
  ): void {
    const state = this.rooms.get(roomName);
    if (!state) {
      return;
    }

    state.sequence += 1;

    this.kafkaClient.emit(Topics[`${kind}Metadata`](roomName), {
      event,
      speaker_id: participantIdentity,
      track_sid: trackSid,
      kind,
      sequence: state.sequence,
      timestamp_ms: Date.now(),
      session_id: roomName,
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const roomName of [...this.rooms.keys()]) {
      this.detachRoom(roomName);
    }
    this.rooms.clear();
  }
}