import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { MediaControlService } from "./media-control.service";

@Controller("api")
@ApiTags("Media Control")
export class MediaControlController {
  constructor(private readonly mediaControlService: MediaControlService) {}

  @Get()
  @ApiOperation({
    summary: "Get service info",
    description: "Returns basic information about the media control service",
  })
  @ApiResponse({
    status: 200,
    description: "Service information",
  })
  getHello(): string {
    return this.mediaControlService.getHello();
  }
}
