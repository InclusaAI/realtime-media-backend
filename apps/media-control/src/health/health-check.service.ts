import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kafka, logLevel } from "kafkajs";
import * as redis from "redis";
import { getKafkaClientOptions } from "../config/kafka.config";

interface ServiceStatus {
  status: "up" | "down";
  details?: string;
}

interface AiServiceEndpoint {
  status: "configured" | "not_configured";
  url?: string;
}

interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  timestamp: string;
  services: {
    kafka: ServiceStatus;
    redis: ServiceStatus;
    livekit: ServiceStatus;
    /**
     * Reported without probing: these are off the media hot path (media travels
     * over Kafka), and Render free-tier services can cold-start for ~50s, so
     * probing them inline would stall the whole health endpoint.
     */
    aiServices: {
      signRecognition: AiServiceEndpoint;
      avatarPose: AiServiceEndpoint;
    };
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
      aiServices: this.reportAiServices(),
    };

    const overallStatus =
      results.kafka.status === "up" &&
      results.redis.status === "up" &&
      results.livekit.status === "up"
        ? "healthy"
        : "unhealthy";

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: results,
    };
  }

  /**
   * Report whether the ai-services endpoints are configured, without calling
   * them. See {@link HealthCheckResult} for why they are not probed.
   */
  private reportAiServices(): {
    signRecognition: AiServiceEndpoint;
    avatarPose: AiServiceEndpoint;
  } {
    const describe = (key: string): AiServiceEndpoint => {
      const url = this.configService.get<string>(key);
      return url ? { status: "configured", url } : { status: "not_configured" };
    };

    return {
      signRecognition: describe("aiServices.signRecognitionUrl"),
      avatarPose: describe("aiServices.avatarPoseUrl"),
    };
  }

  private async checkKafka(): Promise<ServiceStatus> {
    try {
      const kafka = new Kafka({
        // Spread first so the health-check's own clientId/timeout win.
        ...getKafkaClientOptions(this.configService),
        clientId: "health-check",
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

  private async checkRedis(): Promise<ServiceStatus> {
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

  private async checkLiveKit(): Promise<ServiceStatus> {
    try {
      const liveKitUrl = this.configService.get<string>("LIVEKIT_SERVER_URL");
      const apiKey = this.configService.get<string>("LIVEKIT_API_KEY");
      const apiSecret = this.configService.get<string>("LIVEKIT_API_SECRET");

      if (!liveKitUrl || !apiKey || !apiSecret) {
        return {
          status: "down",
          details: "LiveKit credentials not configured",
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${liveKitUrl.replace(/\/$/, '')}/`, {
          method: "GET",
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
