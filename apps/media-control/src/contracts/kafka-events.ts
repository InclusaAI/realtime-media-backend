/**
 * Kafka event contracts — TypeScript source of truth for media.* events
 * published by realtime-media-backend.
 *
 * These interfaces MUST stay in sync with:
 *   ai-services/shared/contracts/src/inclusaai_contracts/events.py
 *
 * The Python models are the authoritative source; this file mirrors them
 * so the NestJS service gets compile-time type safety on every emit().
 *
 * Topic naming convention:
 *   media.session.<sessionId>.audio.chunk
 *   media.session.<sessionId>.video.frame
 *   media.session.<sessionId>.participant.joined
 *   media.session.<sessionId>.participant.left
 */

// ---------------------------------------------------------------------------
// Inbound events (consumed from platform-backend)
// ---------------------------------------------------------------------------

/**
 * `session.created` — published by platform-backend session-service.
 * This is the authoritative session creation event. The media backend
 * consumes it to pre-warm media resources (start media tap).
 *
 * Matches: backend/libs/kafka-contracts/src/sessions.ts::SessionCreatedPayload
 */
export interface SessionCreatedEvent {
  sessionId: string;       // Prisma cuid — used as LiveKit room name (1:1 mapping)
  presentationId: string;  // FK to the presentation
  organizationId: string;  // FK to the organization
  joinCode: string;        // Short code for audience to join
}

/**
 * `session.ended` — published by platform-backend session-service.
 * The media backend consumes it to cleanup room resources.
 *
 * Matches: backend/libs/kafka-contracts/src/sessions.ts::SessionEndedPayload
 */
export interface SessionEndedEvent {
  sessionId: string;  // Prisma cuid — same as LiveKit room name
  endedAt: string;    // ISO 8601 timestamp
}

/**
 * Communication mode — matches platform-backend Prisma enum.
 * Used when creating media sessions via the REST API.
 */
export type CommunicationMode = 'SPEECH' | 'SIGN_LANGUAGE' | 'HYBRID';

// ---------------------------------------------------------------------------
// Outbound events (published → consumed by ai-services)
//
// Field names use snake_case to match the inclusaai_contracts Python models.
// Timestamps are epoch milliseconds (number), not ISO strings.
// ---------------------------------------------------------------------------

/**
 * `media.session.<id>.audio.chunk` — from AudioChunkHandler.
 * Consumed by: asr-service
 * Contract: inclusaai_contracts.events.AudioChunk
 */
export interface AudioChunkEvent {
  session_id: string;
  speaker_id: string;
  sequence: number;
  timestamp_ms: number;
  sample_rate: number;
  encoding: string;
  payload_b64: string;
}

/**
 * `media.session.<id>.video.frame` — from VideoFrameHandler.
 * Consumed by: sign-recognition-service, vision-quality-service
 * Contract: inclusaai_contracts.events.VideoFrame
 */
export interface VideoFrameEvent {
  session_id: string;
  presenter_id: string;
  sequence: number;
  timestamp_ms: number;
  width: number;
  height: number;
  fps: number;
  payload_b64: string;
}

/**
 * `media.session.<id>.participant.joined` / `.left` — from SignalingGateway.
 * Consumed by: engagement-service
 * Contract: inclusaai_contracts.events.ParticipantEvent
 */
export interface ParticipantEvent {
  session_id: string;
  participant_id: string;
  event: 'joined' | 'left';
  timestamp_ms: number;
}

/**
 * `media.session.<id>.audio.metadata` — internal topic from MediaTapAgent.
 * Not consumed by ai-services; used for internal track lifecycle tracking.
 */
export interface AudioMetadataEvent {
  event: 'track_subscribed' | 'track_unsubscribed';
  speaker_id: string;
  track_sid: string;
  kind: 'audio';
  sequence: number;
  timestamp_ms: number;
  session_id: string;
}

/**
 * `media.session.<id>.video.metadata` — internal topic from MediaTapAgent.
 * Not consumed by ai-services; used for internal track lifecycle tracking.
 */
export interface VideoMetadataEvent {
  event: 'track_subscribed' | 'track_unsubscribed';
  speaker_id: string;
  track_sid: string;
  kind: 'video';
  sequence: number;
  timestamp_ms: number;
  session_id: string;
}

// ---------------------------------------------------------------------------
// Topic name builders
// ---------------------------------------------------------------------------

export const Topics = {
  audioChunk: (sessionId: string) =>
    `media.session.${sessionId}.audio.chunk` as const,
  videoFrame: (sessionId: string) =>
    `media.session.${sessionId}.video.frame` as const,
  participantJoined: (sessionId: string) =>
    `media.session.${sessionId}.participant.joined` as const,
  participantLeft: (sessionId: string) =>
    `media.session.${sessionId}.participant.left` as const,
  audioMetadata: (sessionId: string) =>
    `media.session.${sessionId}.audio.metadata` as const,
  videoMetadata: (sessionId: string) =>
    `media.session.${sessionId}.video.metadata` as const,
  // Platform-backend session lifecycle events (inbound)
  sessionCreated: 'session.created' as const,
  sessionEnded: 'session.ended' as const,
} as const;

/**
 * Session ids arrive on the wire from platform-backend and are interpolated into
 * topic names, so they are validated before use: `[A-Za-z0-9_-]+`.
 *
 * Dots are rejected deliberately. ai-services maps a concrete topic back to an
 * event key with `^media\.session\.[^.]+\.audio\.chunk$` — a dotted id would
 * publish successfully but never resolve, silently dropping the message. Prisma
 * cuids (`clx...`) and the room names used in tests all satisfy this.
 */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isValidSessionId(sessionId: unknown): sessionId is string {
  return typeof sessionId === 'string' && SESSION_ID_PATTERN.test(sessionId);
}

/**
 * Every per-session topic this service publishes to.
 *
 * Provisioned up-front on `session.created` because managed brokers (Aiven,
 * Confluent) ship with auto-creation disabled — without this, the first
 * emit() for any session fails with UNKNOWN_TOPIC_OR_PARTITION.
 *
 * These are the four consumed by ai-services (`.audio.chunk`, `.video.frame`,
 * `.participant.joined`, `.participant.left`) plus two internal
 * `.metadata` topics used for track lifecycle tracking.
 */
export function sessionTopics(sessionId: string): string[] {
  return [
    Topics.audioChunk(sessionId),
    Topics.videoFrame(sessionId),
    Topics.participantJoined(sessionId),
    Topics.participantLeft(sessionId),
    Topics.audioMetadata(sessionId),
    Topics.videoMetadata(sessionId),
  ];
}

// ---------------------------------------------------------------------------
// Runtime validation (optional — enable in dev/staging to catch drift early)
// ---------------------------------------------------------------------------

/**
 * Validate an AudioChunkEvent payload at runtime.
 * Returns true if valid, throws with details if not.
 */
export function validateAudioChunk(
  payload: Record<string, unknown>,
): void {
  const required = ['session_id', 'speaker_id', 'sequence', 'timestamp_ms', 'payload_b64'] as const;
  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null) {
      throw new Error(`AudioChunkEvent missing required field: ${field}`);
    }
  }
  if (typeof payload.session_id !== 'string') {
    throw new Error('AudioChunkEvent.session_id must be a string');
  }
  if (typeof payload.speaker_id !== 'string') {
    throw new Error('AudioChunkEvent.speaker_id must be a string');
  }
  if (typeof payload.sequence !== 'number') {
    throw new Error('AudioChunkEvent.sequence must be a number');
  }
  if (typeof payload.timestamp_ms !== 'number') {
    throw new Error('AudioChunkEvent.timestamp_ms must be a number');
  }
  if (typeof payload.payload_b64 !== 'string') {
    throw new Error('AudioChunkEvent.payload_b64 must be a string');
  }
}

/**
 * Validate a VideoFrameEvent payload at runtime.
 */
export function validateVideoFrame(
  payload: Record<string, unknown>,
): void {
  const required = [
    'session_id', 'presenter_id', 'sequence',
    'timestamp_ms', 'width', 'height', 'payload_b64',
  ] as const;
  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null) {
      throw new Error(`VideoFrameEvent missing required field: ${field}`);
    }
  }
  if (typeof payload.session_id !== 'string') {
    throw new Error('VideoFrameEvent.session_id must be a string');
  }
  if (typeof payload.presenter_id !== 'string') {
    throw new Error('VideoFrameEvent.presenter_id must be a string');
  }
  if (typeof payload.timestamp_ms !== 'number') {
    throw new Error('VideoFrameEvent.timestamp_ms must be a number');
  }
}

/**
 * Validate a ParticipantEvent payload at runtime.
 */
export function validateParticipantEvent(
  payload: Record<string, unknown>,
): void {
  const required = ['session_id', 'participant_id', 'event', 'timestamp_ms'] as const;
  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null) {
      throw new Error(`ParticipantEvent missing required field: ${field}`);
    }
  }
  if (payload.event !== 'joined' && payload.event !== 'left') {
    throw new Error(
      `ParticipantEvent.event must be "joined" or "left", got "${payload.event}"`,
    );
  }
  if (typeof payload.timestamp_ms !== 'number') {
    throw new Error('ParticipantEvent.timestamp_ms must be a number');
  }
}
