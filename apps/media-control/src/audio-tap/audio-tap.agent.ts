import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Track,
} from "livekit-client";
import { LiveKitAdapterService } from "../sfu-adapter/src/livekit-adapter.service";
import { io } from "socket.io-client";
import { ClientKafka } from "@nestjs/microservices";

// TODO: Add OpusEncoder from @discordjs/opus when native compilation is available
// import { OpusEncoder } from "@discordjs/opus";

export class AudioTapAgent {
  private room: Room;
  // private encoder: OpusEncoder;
  private trackToParticipant: Map<string, string> = new Map();

  constructor(
    private readonly sfuAdapter: LiveKitAdapterService,
    private readonly kafkaClient: ClientKafka,
  ) {
    // TODO: Initialize encoder when Opus dependency is available
    // this.encoder = new OpusEncoder(48000, 1);
  }

  async start(roomName: string): Promise<void> {
    const { token } = await this.sfuAdapter.join(roomName, "audio-tap-agent");
    this.room = new Room();

    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (track.kind === Track.Kind.Audio) {
          this.trackToParticipant.set(track.sid, participant.identity);
          this.sfuAdapter.startEgress(roomName, track.sid);
          this.createEgressSocket(roomName, track.sid);
        }
      },
    );

    await this.room.connect(this.sfuAdapter.getWsUrl(), token);
    console.log(`Audio tap agent connected to room ${roomName}`);
  }

  private createEgressSocket(roomName: string, trackSid: string) {
    const socket = io("ws://localhost:3000/egress", {
      query: { trackSid },
    });

    socket.on("connect", () => {
      console.log(`Connected to egress websocket for track ${trackSid}`);
    });

    socket.on("data", (data) => {
      const speakerId = this.trackToParticipant.get(trackSid) || "unknown";
      // TODO: Add Opus encoding when @discordjs/opus is available
      const encodedData = Buffer.from(data).toString("base64");
      this.kafkaClient.emit(`media.session.${roomName}.audio.chunk`, {
        speakerId,
        sequence: Date.now(),
        timestamp: new Date().toISOString(),
        data: encodedData,
      });
    });
  }
}
