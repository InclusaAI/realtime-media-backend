import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import livekitConfig from "./config/livekit.config";
import { LiveKitAdapterService } from "./livekit-adapter.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [livekitConfig],
    }),
  ],
  providers: [LiveKitAdapterService],
  exports: [LiveKitAdapterService],
})
export class SfuAdapterModule {}
