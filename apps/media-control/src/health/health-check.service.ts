import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kafka, logLevel } from "kafkajs";
import * as redis from "redis";

interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  timestamp: string;
  services: {
    kafka: { status: "up" | "down"; details?: string };
    redis: { status: "up" | "down"; details?: string };
    livekit: { status: "up" | "down"; details?: string };
  };
}

@Injectable()
export class HealthCheckService {
  constructor(private readonly configService: ConfigService) {}

  async checkHealth(): Promise<HealthCheckResult> {
    const results = {
      kafka: await this.checkKafka(),
      redis: await this.checkRedis(),
      livekit: await this.checkLiveKit(),
    };

    const overallStatus =
      Object.values(results).every((r) => r.status === "up") &&
      results.kafka.status === "up"
        ? "healthy"
        : "unhealthy";

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: results,
    };
  }

  private async checkKafka(): Promise<{
    status: "up" | "down";
    details?: string;
  }> {
    try {
      const brokers = this.configService.get<string[]>("kafka.brokers");
      const kafka = new Kafka({
        clientId: "health-check",
        brokers,
        logLevel: logLevel.ERROR,
        requestTimeout: 5000,
      });

      const admin = kafka.admin();
      await admin.connect();
      await admin.listTopics();
      await admin.disconnect();

      return { status: "up" };
    } catch (error) {
      return {
        status: "down",
        details: `Kafka connection failed: ${(error as Error).message}`,
      };
    }
  }

  private async checkRedis(): Promise<{
    status: "up" | "down";
    details?: string;
  }> {
    try {
      const redisUrl = this.configService.get<string>("REDIS_URL");
      if (!redisUrl) {
        return {
          status: "down",
          details: "REDIS_URL not configured",
        };
      }

      const client = redis.createClient({ url: redisUrl });
      await client.connect();
      await client.ping();
      await client.disconnect();

      return { status: "up" };
    } catch (error) {
      return {
        status: "down",
        details: `Redis connection failed: ${(error as Error).message}`,
      };
    }
  }

  private async checkLiveKit(): Promise<{
    status: "up" | "down";
    details?: string;
  }> {
    try {
      const liveKitUrl = this.configService.get<string>("LIVEKIT_SERVER_URL");
      const apiKey = this.configService.get<string>("LIVEKIT_API_KEY");

      if (!liveKitUrl || !apiKey) {
        return {
          status: "down",
          details: "LiveKit credentials not configured",
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${liveKitUrl}/api/status`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          signal: controller.signal,
        });

        if (response.ok) {
          return { status: "up" };
        } else {
          return {
            status: "down",
            details: `LiveKit returned ${response.status}`,
          };
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      return {
        status: "down",
        details: `LiveKit connection failed: ${(error as Error).message}`,
      };
    }
  }
}
