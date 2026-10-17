import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaAdminService } from './kafka-admin.service';

const INVALID_REPLICATION_FACTOR = 37;

describe('KafkaAdminService', () => {
  let service: KafkaAdminService;
  let listTopics: jest.Mock;
  let createTopics: jest.Mock;
  let disconnect: jest.Mock;

  /** Install a fake admin client as the service's lazily-created instance. */
  function useAdmin(overrides: Record<string, unknown> = {}): void {
    listTopics = jest.fn().mockResolvedValue([]);
    createTopics = jest.fn().mockResolvedValue(true);
    disconnect = jest.fn().mockResolvedValue(undefined);

    (service as any).admin = {
      listTopics,
      createTopics,
      disconnect,
      ...overrides,
    };
  }

  async function makeService(env: Record<string, unknown> = {}): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        KafkaAdminService,
        {
          provide: ConfigService,
          useValue: { get: (key: string, fallback?: unknown) => env[key] ?? fallback },
        },
      ],
    }).compile();

    service = moduleRef.get(KafkaAdminService);
  }

  beforeEach(async () => {
    await makeService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('ensureTopics', () => {
    it('creates every topic when none exist', async () => {
      useAdmin();
      const topics = ['media.session.s1.audio.chunk', 'media.session.s1.video.frame'];

      await expect(service.ensureTopics(topics)).resolves.toBe(true);

      expect(createTopics).toHaveBeenCalledTimes(1);
      expect(createTopics.mock.calls[0][0].topics).toEqual([
        { topic: topics[0], numPartitions: 3, replicationFactor: 3 },
        { topic: topics[1], numPartitions: 3, replicationFactor: 3 },
      ]);
    });

    it('creates nothing when all topics already exist', async () => {
      useAdmin({ listTopics: jest.fn().mockResolvedValue(['a', 'b']) });

      await expect(service.ensureTopics(['a', 'b'])).resolves.toBe(true);

      expect(createTopics).not.toHaveBeenCalled();
    });

    it('creates only the missing topics on a partial match', async () => {
      useAdmin({ listTopics: jest.fn().mockResolvedValue(['exists']) });

      await service.ensureTopics(['exists', 'missing']);

      expect(createTopics.mock.calls[0][0].topics).toEqual([
        { topic: 'missing', numPartitions: 3, replicationFactor: 3 },
      ]);
    });

    it('honours KAFKA_TOPIC_PARTITIONS / _REPLICATION_FACTOR overrides', async () => {
      await makeService({
        KAFKA_TOPIC_PARTITIONS: 6,
        KAFKA_TOPIC_REPLICATION_FACTOR: 2,
      });
      useAdmin();

      await service.ensureTopics(['t']);

      expect(createTopics.mock.calls[0][0].topics[0]).toEqual({
        topic: 't',
        numPartitions: 6,
        replicationFactor: 2,
      });
    });

    it('is a no-op for an empty topic list', async () => {
      useAdmin();

      await expect(service.ensureTopics([])).resolves.toBe(true);
      expect(createTopics).not.toHaveBeenCalled();
      expect(listTopics).not.toHaveBeenCalled();
    });

    it('is idempotent across repeated calls', async () => {
      useAdmin();

      await service.ensureTopics(['t1', 't2']);
      // Simulate the broker now holding them.
      listTopics.mockResolvedValue(['t1', 't2']);
      await service.ensureTopics(['t1', 't2']);

      expect(createTopics).toHaveBeenCalledTimes(1);
    });
  });

  describe('resilience', () => {
    it('falls back to replication factor 1 on a single-broker cluster', async () => {
      const err: any = new Error('replication factor is larger than the number of available brokers');
      err.code = INVALID_REPLICATION_FACTOR;
      useAdmin();
      createTopics
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce(true);

      await expect(service.ensureTopics(['t'])).resolves.toBe(true);

      expect(createTopics).toHaveBeenCalledTimes(2);
      expect(createTopics.mock.calls[1][0].topics[0].replicationFactor).toBe(1);
    });

    it('does not retry on unrelated createTopics failures', async () => {
      const err: any = new Error('cluster authorization failed');
      err.code = 31;
      useAdmin();
      createTopics.mockRejectedValue(err);

      await expect(service.ensureTopics(['t'])).resolves.toBe(false);

      expect(createTopics).toHaveBeenCalledTimes(1);
    });

    it('attempts all topics when listTopics fails', async () => {
      useAdmin({ listTopics: jest.fn().mockRejectedValue(new Error('metadata unavailable')) });

      await expect(service.ensureTopics(['t1', 't2'])).resolves.toBe(true);

      expect(createTopics.mock.calls[0][0].topics).toHaveLength(2);
    });

    it('returns false rather than throwing when provisioning fails', async () => {
      useAdmin({ listTopics: jest.fn().mockRejectedValue(new Error('boom')) });
      createTopics.mockRejectedValue(new Error('boom'));

      // A provisioning failure must not abort session setup — the real failure
      // surfaces later on the emit path.
      await expect(service.ensureTopics(['t'])).resolves.toBe(false);
    });
  });

  describe('connection lifecycle', () => {
    it('reuses the cached admin client across calls', async () => {
      useAdmin();
      const first = (service as any).admin;

      await service.ensureTopics(['t1']);
      await service.ensureTopics(['t2']);

      // Same instance still in use — no reconnect per call.
      expect((service as any).admin).toBe(first);
      expect(listTopics).toHaveBeenCalledTimes(2);
    });

    it('disconnects the admin client on shutdown', async () => {
      const disconnect = jest.fn().mockResolvedValue(undefined);
      useAdmin({ disconnect });

      await service.onModuleDestroy();

      expect(disconnect).toHaveBeenCalledTimes(1);
      expect((service as any).admin).toBeNull();
    });

    it('is safe to destroy when never connected', async () => {
      await makeService();

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });

    it('does not throw when disconnect fails during shutdown', async () => {
      useAdmin({ disconnect: jest.fn().mockRejectedValue(new Error('already closed')) });

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});