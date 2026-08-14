import { Controller } from "@nestjs/common";
import { EventPattern, Payload } from "@nestjs/microservices";
import { LiveKitAdapterService } from "../src/sfu-adapter/livekit-adapter.service";

@Controller()
export class SessionController {
  constructor(private readonly sfuAdapter: LiveKitAdapterService) {}

  @EventPattern("session.created")
  async handleSessionCreated(
    @Payload() data: { roomName: string },
  ): Promise<void> {
    // The room is created automatically when the first participant joins,
    // so we don't need to do anything here.
  }

  @EventPattern("session.ended")
  async handleSessionEnded(
    @Payload() data: { roomName: string },
  ): Promise<void> {
    // LiveKit rooms are automatically deleted when the last participant leaves,
    // so we don't need to do anything here.
  }
}
