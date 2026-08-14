import { Injectable } from '@nestjs/common';

@Injectable()
export class MediaControlService {
  getHello(): string {
    return 'Hello World!';
  }
}
