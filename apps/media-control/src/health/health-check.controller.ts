import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { HealthCheckService } from "./health-check.service";

@Controller("health")
@ApiTags("Health")
export class HealthCheckController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get("live")
  @ApiOperation({
    summary: "Liveness check endpoint",
    description: "Returns 200 while this HTTP process is running",
  })
  async getLiveness() {
    return { status: "alive", timestamp: new Date().toISOString() };
  }

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
      "Returns 200 while the HTTP service is ready to accept requests",
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
    return {
      ready: true,
      message: "HTTP service is ready to accept requests",
      timestamp: new Date().toISOString(),
    };
  }
}
