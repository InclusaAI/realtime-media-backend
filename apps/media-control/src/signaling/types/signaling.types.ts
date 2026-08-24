/**
 * Typed user data attached to a Socket after JWT authentication.
 */
export interface AuthenticatedUser {
  /** The participant's unique identity (e.g. user ID). */
  participantIdentity: string;
  /** The room name the user is authorized to join. */
  roomName: string;
  /** Any additional JWT claims. */
  [key: string]: unknown;
}

/**
 * Payload for the 'join-room' event.
 * Sent by the client to authenticate and join a room.
 */
export interface JoinRoomPayload {
  /** JWT token for authentication. */
  token: string;
  /** The room name to join. */
  roomName: string;
  /** The participant's unique identity. */
  participantIdentity: string;
}

/**
 * Payload for the 'leave-room' event.
 */
export interface LeaveRoomPayload {
  roomName: string;
  participantIdentity: string;
}

/**
 * Payload for 'offer', 'answer', and 'ice-candidate' relay events.
 */
export interface RelayPayload {
  /** The socket ID of the target recipient. */
  to: string;
  /** The SDP offer, answer, or ICE candidate to relay. */
  offer?: unknown;
  answer?: unknown;
  candidate?: unknown;
}

/**
 * Participant joined event emitted to the room.
 */
export interface ParticipantJoinedEvent {
  participantIdentity: string;
  joinedAt: string;
}

/**
 * Participant left event emitted to the room.
 */
export interface ParticipantLeftEvent {
  participantIdentity: string;
  leftAt: string;
}

/**
 * Participant disconnected event (triggers grace period).
 */
export interface ParticipantDisconnectedEvent {
  participantIdentity: string;
  disconnectedAt: string;
  gracePeriodMs: number;
}

/**
 * Participant reconnected event (within grace period).
 */
export interface ParticipantReconnectedEvent {
  participantIdentity: string;
  reconnectedAt: string;
}

/**
 * Connection quality report from client.
 * Clients should send this periodically (e.g., every 5 seconds).
 */
export interface QualityReport {
  /** Round-trip time in milliseconds */
  rtt: number;
  /** Packet loss percentage (0-100) */
  packetLoss: number;
  /** Jitter in milliseconds */
  jitter: number;
  /** Current bitrate in kbps */
  bitrate: number;
}

/**
 * Quality adaptation command sent to client.
 */
export interface QualityAdaptEvent {
  reason: 'high_packet_loss' | 'high_rtt';
  suggestedQuality: 'low' | 'medium' | 'high';
  timestamp: string;
}

/**
 * Kafka event for participant.joined
 */
export interface KafkaParticipantEvent {
  participantIdentity: string;
  roomName: string;
  timestamp: string;
}

/**
 * Kafka event for participant.reconnected
 */
export interface KafkaParticipantReconnectedEvent {
  participantIdentity: string;
  roomName: string;
  wasDisconnectedAt: string;
  reconnectedAt: string;
  timestamp: string;
}

/**
 * Kafka event for participant.left (grace period expired)
 */
export interface KafkaParticipantLeftEvent {
  participantIdentity: string;
  roomName: string;
  reason: 'explicit_leave' | 'grace_period_expired';
  timestamp: string;
}
