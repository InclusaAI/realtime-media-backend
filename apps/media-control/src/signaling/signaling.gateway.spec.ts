import { Test, TestingModule } from '@nestjs/testing';
import { SignalingGateway } from './signaling.gateway';
import { LiveKitAdapterService } from '../sfu-adapter/livekit-adapter.service';
import { AudioTapService } from '../audio-tap/audio-tap.service';
import { SessionsService } from '../sessions/sessions.service';
import { ConfigService } from '@nestjs/config';

describe('SignalingGateway', () => {
  let gateway: SignalingGateway;

  const mockSfuAdapter = {
    join: jest.fn().mockResolvedValue({ token: 'mock-token' }),
    leave: jest.fn().mockResolvedValue(undefined),
  };

  const mockKafkaClient = {
    emit: jest.fn(),
  };

  const mockAudioTapService = {
    startAudioTap: jest.fn().mockResolvedValue(undefined),
    stopAudioTap: jest.fn().mockResolvedValue(undefined),
  };

  const mockSessionsService = {
    addParticipant: jest.fn().mockReturnValue({ isReconnection: false }),
    removeParticipant: jest.fn().mockReturnValue({ gracePeriodMs: 5000 }),
    updateConnectionQuality: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignalingGateway,
        { provide: LiveKitAdapterService, useValue: mockSfuAdapter },
        { provide: 'KAFKA_SERVICE', useValue: mockKafkaClient },
        { provide: AudioTapService, useValue: mockAudioTapService },
        { provide: SessionsService, useValue: mockSessionsService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    gateway = module.get<SignalingGateway>(SignalingGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should track connections', () => {
    const mockClient = { id: 'socket-1' };
    gateway.handleConnection(mockClient as any);
    expect(gateway).toBeDefined();
  });

  it('should handle disconnect gracefully when client has no room info', () => {
    const mockClient = { id: 'unknown-socket' };
    gateway.handleDisconnect(mockClient as any);
    // Should not throw — socketInfo is empty for unknown client
    expect(mockSessionsService.removeParticipant).not.toHaveBeenCalled();
  });
});
