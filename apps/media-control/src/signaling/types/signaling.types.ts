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
 * Kafka event for participant.joined
 */
export interface KafkaParticipantEvent {
  participantIdentity: string;
  roomName: string;
  timestamp: string;
}
