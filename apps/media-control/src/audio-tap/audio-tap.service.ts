import { Inject, Injectable } from "@nestjs/common";
import { ClientKafka } from "@nestjs/microservices";
import { LiveKitAdapterService } from "../sfu-adapter/src/livekit-adapter.service";
import { AudioTapAgent } from "./audio-tap.agent";

@Injectable()
export class AudioTapService {
  constructor(
    private readonly sfuAdapter: LiveKitAdapterService,
    @Inject("KAFKA_SERVICE") private readonly kafkaClient: ClientKafka,
  ) {}

  async startAudioTap(roomName: string): Promise<void> {
    const agent = new AudioTapAgent(this.sfuAdapter, this.kafkaClient);
    await agent.start(roomName);
  }
}
