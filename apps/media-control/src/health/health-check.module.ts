import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthCheckService } from "./health-check.service";
import { HealthCheckController } from "./health-check.controller";

@Module({
  imports: [ConfigModule],
  controllers: [HealthCheckController],
  providers: [HealthCheckService],
  exports: [HealthCheckService],
})
export class HealthCheckModule {}
