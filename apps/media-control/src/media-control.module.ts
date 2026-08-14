import { Module } from "@nestjs/common";
import { SfuAdapterModule } from "./sfu-adapter/sfu-adapter.module";
import { MediaControlController } from "./media-control.controller";
import { MediaControlService } from "./media-control.service";

@Module({
  imports: [SfuAdapterModule],
  controllers: [MediaControlController],
  providers: [MediaControlService],
})
export class MediaControlModule {}
