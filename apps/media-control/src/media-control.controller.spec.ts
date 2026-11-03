import { Test, TestingModule } from '@nestjs/testing';
import { MediaControlController } from './media-control.controller';
import { MediaControlService } from './media-control.service';

describe('MediaControlController', () => {
  let controller: MediaControlController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaControlController],
      providers: [
        {
          provide: MediaControlService,
          useValue: {
            getHello: jest.fn().mockReturnValue('Hello World!'),
          },
        },
      ],
    }).compile();

    controller = module.get<MediaControlController>(MediaControlController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return Hello World', () => {
    expect(controller.getHello()).toBe('Hello World!');
  });
});
