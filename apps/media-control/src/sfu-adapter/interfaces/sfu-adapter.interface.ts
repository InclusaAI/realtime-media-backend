/**
 * Information about a media track.
 */
export interface TrackInfo {
  /** Unique identifier for the track. */
  sid: string;
  /** The kind of track (audio or video). */
  kind: 'audio' | 'video';
  /** The source of the track (camera, microphone, screen_share, etc.). */
  source?: string;
  /** Additional metadata about the track. */
  [key: string]: unknown;
}

/**
 * Abstract interface for SFU (Selective Forwarding Unit) adapters.
 * Implementations include LiveKit, mediasoup, etc.
 */
export interface SfuAdapter {
  /** Generate an access token for a participant to join a room. */
  join(
    roomName: string,
    participantIdentity: string,
  ): Promise<{ token: string }>;

  /** Remove a participant from a room. */
  leave(roomName: string, participantIdentity: string): Promise<void>;

  /** Update track publishing permissions for a participant. */
  publish(
    roomName: string,
    participantIdentity: string,
    trackInfo: TrackInfo,
  ): Promise<unknown>;

  /** Update track subscription permissions for a participant. */
  subscribe(
    roomName: string,
    participantIdentity: string,
    trackId: string,
  ): Promise<unknown>;

  /** Get the current state of a room. */
  getRoomState(roomName: string): Promise<unknown>;

  /**
   * Start egress (media extraction) for a specific track in a room.
   * @param roomName - LiveKit room name
   * @param trackId - track SID to capture
   * @param websocketUrl - optional WebSocket URL to stream data to
   */
  startEgress(
    roomName: string,
    trackId: string,
    websocketUrl?: string,
  ): Promise<unknown>;

  /** Get the WebSocket URL for the SFU server. */
  getWsUrl(): string;
}
