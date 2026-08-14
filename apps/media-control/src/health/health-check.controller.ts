import { Controller, Get } from "@nestjs/common";
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
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: "Service is unhealthy",
  })
  async getHealth() {
    return this.healthCheckService.checkHealth();
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
    } else {
      return { ready: false, message: "Some systems are unavailable" };
    }
  }
}
