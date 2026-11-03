import { JoinRoomGuard } from './join-room.guard';
import { ConfigService } from '@nestjs/config';

describe('JoinRoomGuard', () => {
  let guard: JoinRoomGuard;

  beforeEach(() => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    guard = new JoinRoomGuard(mockConfigService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return false when no token is provided', () => {
    const mockContext = {
      switchToWs: jest.fn().mockReturnValue({
        getClient: jest.fn().mockReturnValue({ emit: jest.fn() }),
        getData: jest.fn().mockReturnValue({}),
      }),
    } as any;

    expect(guard.canActivate(mockContext)).toBe(false);
  });

  it('should return false when token is invalid', () => {
    const mockContext = {
      switchToWs: jest.fn().mockReturnValue({
        getClient: jest.fn().mockReturnValue({ emit: jest.fn() }),
        getData: jest.fn().mockReturnValue({ token: 'bad-token' }),
      }),
    } as any;

    expect(guard.canActivate(mockContext)).toBe(false);
  });
});
