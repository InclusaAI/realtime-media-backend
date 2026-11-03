import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { HealthCheckService } from "./health-check.service";

@Controller("health")
@ApiTags("Health")
export class HealthCheckController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get()
  @ApiOperation({
    summary: "Health check endpoint",
    description:
      "Returns the health status of the service and its dependencies",
  })
  @ApiResponse({
    status: 200,
    description: "Service is healthy",
    schema: {
      example: {
        status: "healthy",
        timestamp: "2024-01-15T10:30:00Z",
        services: {
          kafka: { status: "up" },
          redis: { status: "up" },
          livekit: { status: "up" },
          aiServices: {
            signRecognition: {
              status: "configured",
              url: "https://sign-recognition-service.onrender.com",
            },
            avatarPose: {
              status: "configured",
              url: "https://avatar-pose-service.onrender.com",
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: "Service is unhealthy",
  })
  async getHealth() {
    const health = await this.healthCheckService.checkHealth();
    if (health.status !== "healthy") {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }

  @Get("ready")
  @ApiOperation({
    summary: "Readiness check endpoint",
    description:
      "Returns 200 only if all critical services are ready (Kafka, Redis, LiveKit)",
  })
  @ApiResponse({
    status: 200,
    description: "Service is ready to accept requests",
  })
  @ApiResponse({
    status: 503,
    description: "Service is not ready",
  })
  async getReadiness() {
    const health = await this.healthCheckService.checkHealth();
    if (health.status === "healthy") {
      return { ready: true, message: "All systems operational" };
    }
    throw new ServiceUnavailableException({
      ready: false,
      message: "Some systems are unavailable",
      services: health.services,
    });
  }
}
