export interface SfuAdapter {
  join(
    roomName: string,
    participantIdentity: string,
  ): Promise<{ token: string }>;
  leave(roomName: string, participantIdentity: string): Promise<void>;
  publish(
    roomName: string,
    participantIdentity: string,
    trackInfo: any,
  ): Promise<any>;
  subscribe(
    roomName: string,
    participantIdentity: string,
    trackId: string,
  ): Promise<any>;
  getRoomState(roomName: string): Promise<any>;
}
