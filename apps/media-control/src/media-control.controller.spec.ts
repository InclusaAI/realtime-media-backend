import { Test, TestingModule } from '@nestjs/testing';
import { MediaControlController } from './media-control.controller';
import { MediaControlService } from './media-control.service';

describe('MediaControlController', () => {
  let mediaControlController: MediaControlController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [MediaControlController],
      providers: [MediaControlService],
    }).compile();

    mediaControlController = app.get<MediaControlController>(MediaControlController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(mediaControlController.getHello()).toBe('Hello World!');
    });
  });
});
