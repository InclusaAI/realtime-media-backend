import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Admin, Kafka } from 'kafkajs';
import { getKafkaClientOptions } from '../config/kafka.config';

/** Kafka error code for a replication factor the cluster cannot satisfy. */
const INVALID_REPLICATION_FACTOR = 37;

/**
 * Provisions Kafka topics at runtime.
 *
 * Managed brokers (Aiven, Confluent Cloud) ship with topic auto-creation
 * disabled, so a producer pointed at a topic that does not yet exist fails with
 * UNKNOWN_TOPIC_OR_PARTITION rather than creating it. The `media.session.*`
 * topics are per-session and so cannot be created ahead of time — they are
 * created here when `session.created` arrives.
 *
 * Holds one lazily-connected admin client, shared across calls. A broker restart
 * drops the connection; the next `ensureTopics()` transparently reconnects
 * rather than leaving a dead client cached.
 */
@Injectable()
export class KafkaAdminService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaAdminService.name);

  private admin: Admin | null = null;
  /** In-flight connection attempt, shared so concurrent calls make one. */
  private connecting: Promise<Admin> | null = null;

  constructor(private readonly configService: ConfigService) {}

  private async getAdmin(): Promise<Admin> {
    if (this.admin) {
      return this.admin;
    }

    if (!this.connecting) {
      const attempt = (async () => {
        const admin = new Kafka({
          ...getKafkaClientOptions(this.configService),
          clientId: 'realtime-media-backend-topic-admin',
        }).admin();

        await admin.connect();
        this.admin = admin;
        return admin;
      })();

      // Clear the shared handle either way, so a failed attempt does not poison
      // later calls and a success is never clobbered by its own cleanup.
      this.connecting = attempt.finally(() => {
        this.connecting = null;
      });

      return this.connecting;
    }

    return this.connecting;
  }

  /**
   * Create `topics` if they do not already exist.
   *
   * Idempotent: re-running against an existing topic is a no-op, so this is
   * safe on repeated `session.created` deliveries. Never throws — a
   * provisioning failure must not abort session setup, so it is logged and the
   * emit() path surfaces the real failure later.
   *
   * @returns true when every topic exists afterwards.
   */
  async ensureTopics(topics: string[]): Promise<boolean> {
    if (topics.length === 0) {
      return true;
    }

    const partitions = this.positiveInt('KAFKA_TOPIC_PARTITIONS', 3);
    const replicationFactor = this.positiveInt(
      'KAFKA_TOPIC_REPLICATION_FACTOR',
      3,
    );

    try {
      const admin = await this.getAdmin();
      const missing = await this.createMissing(
        admin,
        topics,
        partitions,
        replicationFactor,
      );

      if (missing.length > 0) {
        this.logger.log(
          `Provisioned ${missing.length} topic(s) for session: ${missing.join(', ')}`,
        );
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to provision topics [${topics.join(', ')}]: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Create the subset of `topics` that does not already exist.
   *
   * Falls back to a replication factor of 1 when the cluster cannot satisfy the
   * requested one — single-broker local Redpanda otherwise fails outright,
   * which would make the same code path unusable in dev.
   */
  private async createMissing(
    admin: Admin,
    topics: string[],
    partitions: number,
    replicationFactor: number,
  ): Promise<string[]> {
    let existing: Set<string>;
    try {
      existing = new Set(await admin.listTopics());
    } catch (error) {
      // Without a listing we cannot tell what is missing; just attempt all of
      // them. createTopics treats existing topics as a no-op.
      this.logger.warn(
        `Could not list topics (${(error as Error).message}); ` +
          'attempting to create all requested topics.',
      );
      existing = new Set<string>();
    }

    const missing = topics.filter((topic) => !existing.has(topic));
    if (missing.length === 0) {
      return [];
    }

    const specs = (rf: number) =>
      missing.map((topic) => ({
        topic,
        numPartitions: partitions,
        replicationFactor: rf,
      }));

    try {
      await admin.createTopics({ waitForLeaders: true, topics: specs(replicationFactor) });
      return missing;
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== INVALID_REPLICATION_FACTOR) {
        throw error;
      }

      this.logger.warn(
        `Replication factor ${replicationFactor} rejected by the cluster; ` +
          'retrying with 1. Single-replica topics will lose data on broker failure.',
      );
      await admin.createTopics({ waitForLeaders: true, topics: specs(1) });
      return missing;
    }
  }

  private positiveInt(key: string, fallback: number): number {
    const raw = Number(this.configService.get<string | number>(key, fallback));
    return Number.isInteger(raw) && raw > 0 ? raw : fallback;
  }

  async onModuleDestroy(): Promise<void> {
    const admin = this.admin;
    this.admin = null;

    if (!admin) {
      return;
    }

    try {
      await admin.disconnect();
    } catch (error) {
      // Shutdown is already in progress; a failed disconnect is not actionable.
      this.logger.debug(
        `Error disconnecting Kafka admin client: ${(error as Error).message}`,
      );
    }
  }
}