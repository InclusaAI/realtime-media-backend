import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AccessToken,
  EgressClient,
  RoomServiceClient,
} from "livekit-server-sdk";
import { SfuAdapter } from "./interfaces/sfu-adapter.interface";

@Injectable()
export class LiveKitAdapterService implements SfuAdapter {
  private readonly roomService: RoomServiceClient;
  private readonly egressClient: EgressClient;
  private readonly serverUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.serverUrl =
      this.configService.get<string>("LIVEKIT_SERVER_URL") ||
      "http://localhost:7880";
    this.apiKey = this.configService.get<string>("LIVEKIT_API_KEY") || "devkey";
    this.apiSecret =
      this.configService.get<string>("LIVEKIT_API_SECRET") || "secret";

    this.roomService = new RoomServiceClient(
      this.serverUrl,
      this.apiKey,
      this.apiSecret,
    );
    this.egressClient = new EgressClient(
      this.serverUrl,
      this.apiKey,
      this.apiSecret,
    );
  }

  getRoomState(roomName: string): Promise<any> {
    throw new Error("Method not implemented.");
  }

  async startEgress(roomName: string, trackId: string): Promise<any> {
    // TODO: Implement proper egress configuration with LiveKit SDK
    // This requires the correct egress output type from the SDK
    console.log(`Starting egress for room ${roomName}, track ${trackId}`);
    return Promise.resolve({ status: "pending" });
  }

  async join(
    roomName: string,
    participantIdentity: string,
  ): Promise<{ token: string }> {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: participantIdentity,
    });
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

  getWsUrl(): string {
    return this.serverUrl;
  }
}
