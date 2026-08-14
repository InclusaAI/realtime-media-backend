import { Inject, Injectable } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import livekitConfig from "./config/livekit.config";
import { SfuAdapter } from "./interfaces/sfu-adapter.interface";

@Injectable()
export class LiveKitAdapterService implements SfuAdapter {
  private readonly roomService: RoomServiceClient;

  constructor(
    @Inject(livekitConfig.KEY)
    private readonly livekitConfiguration: ConfigType<typeof livekitConfig>,
  ) {
    this.roomService = new RoomServiceClient(
      this.livekitConfiguration.serverUrl,
      this.livekitConfiguration.apiKey,
      this.livekitConfiguration.apiSecret,
    );
  }

  async join(
    roomName: string,
    participantIdentity: string,
  ): Promise<{ token: string }> {
    const at = new AccessToken(
      this.livekitConfiguration.apiKey,
      this.livekitConfiguration.apiSecret,
      {
        identity: participantIdentity,
      },
    );
    at.addGrant({ roomJoin: true, room: roomName });

    return { token: await at.toJwt() };
  }

  async leave(roomName: string, participantIdentity: string): Promise<void> {
    await this.roomService.removeParticipant(roomName, participantIdentity);
  }
  async publish(
    roomName: string,
    participantIdentity: string,
    trackInfo: any,
  ): Promise<any> {
    const grant = {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    };
    await this.roomService.updateParticipant(
      roomName,
      participantIdentity,
      undefined,
      {
        canPublish: true,
        canSubscribe: true,
      },
    );
    return Promise.resolve(undefined);
  }
  async subscribe(
    roomName: string,
    participantIdentity: string,
    trackId: string,
  ): Promise<any> {
    const grant = {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    };
    await this.roomService.updateParticipant(
      roomName,
      participantIdentity,
      undefined,
      {
        canPublish: true,
        canSubscribe: true,
      },
    );
    return Promise.resolve(undefined);
  }
  async getRoomState(roomName: string): Promise<any> {
    return await this.roomService.listParticipants(roomName);
  }
}
