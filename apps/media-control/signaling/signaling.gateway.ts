import { Inject, UseGuards } from "@nestjs/common";
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
} from "@nestjs/websockets";
import { ClientKafka } from "@nestjs/microservices";
import { Server, Socket } from "socket.io";
import { JoinRoomGuard } from "../join-room/join-room.guard";
import { LiveKitAdapterService } from "../src/sfu-adapter/livekit-adapter.service";
import { AudioTapService } from "../src/audio-tap/audio-tap.service";

@WebSocketGateway()
export class SignalingGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly sfuAdapter: LiveKitAdapterService,
    @Inject("KAFKA_SERVICE") private readonly kafkaClient: ClientKafka,
    private readonly audioTapService: AudioTapService,
  ) {}

  @UseGuards(JoinRoomGuard)
  @SubscribeMessage("join-room")
  async handleJoinRoom(@ConnectedSocket() client: Socket): Promise<void> {
    const { roomName, participantIdentity } = (client as any).user;
    const { token } = await this.sfuAdapter.join(roomName, participantIdentity);
    client.join(roomName);
    this.server.to(roomName).emit("participant-joined", {
      participantIdentity,
    });
    this.kafkaClient.emit(`media.session.${roomName}.participant.joined`, {
      participantIdentity,
    });
    client.emit("token", { token });
    this.audioTapService.startAudioTap(roomName);
  }

  @SubscribeMessage("leave-room")
  async handleLeaveRoom(
    @MessageBody() data: { roomName: string; participantIdentity: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await this.sfuAdapter.leave(data.roomName, data.participantIdentity);
    client.leave(data.roomName);
    this.server.to(data.roomName).emit("participant-left", {
      participantIdentity: data.participantIdentity,
    });
    this.kafkaClient.emit(`media.session.${data.roomName}.participant.left`, {
      participantIdentity: data.participantIdentity,
    });
  }

  @SubscribeMessage("offer")
  handleOffer(
    @MessageBody() data: { to: string; offer: any },
    @ConnectedSocket() client: Socket,
  ): void {
    this.server
      .to(data.to)
      .emit("offer", { from: client.id, offer: data.offer });
  }

  @SubscribeMessage("answer")
  handleAnswer(
    @MessageBody() data: { to: string; answer: any },
    @ConnectedSocket() client: Socket,
  ): void {
    this.server
      .to(data.to)
      .emit("answer", { from: client.id, answer: data.answer });
  }

  @SubscribeMessage("ice-candidate")
  handleIceCandidate(
    @MessageBody() data: { to: string; candidate: any },
    @ConnectedSocket() client: Socket,
  ): void {
    this.server.to(data.to).emit("ice-candidate", {
      from: client.id,
      candidate: data.candidate,
    });
  }
}
