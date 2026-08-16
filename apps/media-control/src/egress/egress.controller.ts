import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({ namespace: "/egress" })
export class EgressController
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private sockets: Map<string, Socket> = new Map();

  handleConnection(client: Socket, ...args: any[]) {
    const trackSid = client.handshake.query.trackSid as string;
    this.sockets.set(trackSid, client);
  }

  handleDisconnect(client: Socket) {
    const trackSid = client.handshake.query.trackSid as string;
    this.sockets.delete(trackSid);
  }
}
