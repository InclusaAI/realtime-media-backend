import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
  MessageBody,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { EgressService } from "./egress.service";
import { AudioChunkHandler } from "../audio-tap/audio-chunk.handler";

/**
 * WebSocket gateway that receives media data from LiveKit Egress.
 *
 * LiveKit Egress streams raw track data to this WebSocket endpoint.
 * The connection is identified by query params: roomName, trackSid, kind.
 *
 * Binary messages contain raw audio/video frames that are parsed,
 * enriched with metadata, and published to Kafka.
 */
@WebSocketGateway({ namespace: "/egress" })
export class EgressController
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EgressController.name);

  @WebSocketServer()
  server: Server;

  /** Active egress connections: trackSid -> socket */
  private sockets: Map<string, Socket> = new Map();

  /** Room/track metadata per socket */
  private socketMeta: Map<
    string,
    { roomName: string; trackSid: string; kind: string }
  > = new Map();

  constructor(
    private readonly egressService: EgressService,
    private readonly audioChunkHandler: AudioChunkHandler,
  ) {}

  handleConnection(client: Socket): void {
    const roomName = client.handshake.query.roomName as string;
    const trackSid = client.handshake.query.trackSid as string;
    const kind = (client.handshake.query.kind as string) || "audio";

    if (trackSid) {
      this.sockets.set(trackSid, client);
      this.socketMeta.set(client.id, { roomName, trackSid, kind });
      this.logger.log(
        `Egress client connected: room=${roomName} track=${trackSid} kind=${kind} (socket=${client.id})`,
      );

      // Register track-to-participant mapping if available
      const participantIdentity = client.handshake.query
        .participantIdentity as string;
      if (participantIdentity) {
        this.audioChunkHandler.setTrackParticipant(
          trackSid,
          participantIdentity,
        );
      }
    } else {
      this.logger.warn(
        `Egress client connected without trackSid query param (socket=${client.id})`,
      );
    }
  }

  handleDisconnect(client: Socket): void {
    const meta = this.socketMeta.get(client.id);
    if (meta) {
      this.sockets.delete(meta.trackSid);
      this.socketMeta.delete(client.id);
      this.logger.log(
        `Egress client disconnected: room=${meta.roomName} track=${meta.trackSid} (socket=${client.id})`,
      );
    }
  }

  /**
   * Handle binary audio data from LiveKit Egress.
   * LiveKit sends raw audio frames as binary WebSocket messages.
   */
  @SubscribeMessage("audio")
  handleAudioData(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: Buffer,
  ): void {
    const meta = this.socketMeta.get(client.id);
    if (!meta) {
      this.logger.warn(
        `Received audio data from unregistered socket ${client.id}`,
      );
      return;
    }

    if (meta.kind !== "audio") {
      this.logger.warn(
        `Received audio data on non-audio track ${meta.trackSid}`,
      );
      return;
    }

    this.audioChunkHandler.processAudioFrame(
      meta.roomName,
      meta.trackSid,
      Buffer.isBuffer(data) ? data : Buffer.from(data),
    );
  }

  /**
   * Handle raw binary data (alternative for LiveKit Egress).
   * Some LiveKit Egress versions send data as raw binary frames
   * without an event name.
   */
  handleRawMessage(client: Socket, data: Buffer | ArrayBuffer | ArrayBufferLike): void {
    const meta = this.socketMeta.get(client.id);
    if (!meta) {
      return;
    }

    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else {
      buffer = Buffer.from(new Uint8Array(data));
    }

    if (meta.kind === "audio") {
      this.audioChunkHandler.processAudioFrame(
        meta.roomName,
        meta.trackSid,
        buffer,
      );
    }
    // Video frames would be handled here in Phase 3
  }

  /**
   * Emit data to a specific track's connected egress socket.
   * Called by external services to send control messages.
   */
  emitToTrack(trackSid: string, eventName: string, data: unknown): void {
    const socket = this.sockets.get(trackSid);
    if (socket) {
      socket.emit(eventName, data);
    } else {
      this.logger.warn(
        `No egress socket found for track ${trackSid}, dropping event ${eventName}`,
      );
    }
  }

  /**
   * Get the number of active egress connections.
   */
  getConnectionCount(): number {
    return this.sockets.size;
  }
}
