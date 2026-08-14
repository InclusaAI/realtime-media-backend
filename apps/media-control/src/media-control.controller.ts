import { Controller, Get } from '@nestjs/common';
import { MediaControlService } from './media-control.service';

@Controller()
export class MediaControlController {
  constructor(private readonly mediaControlService: MediaControlService) {}

  @Get()
  getHello(): string {
    return this.mediaControlService.getHello();
  }
}
