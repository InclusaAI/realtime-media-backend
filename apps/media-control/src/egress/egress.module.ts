import { Module } from "@nestjs/common";
import { EgressService } from "./egress.service";
import { EgressController } from "./egress.controller";

@Module({
  providers: [EgressService, EgressController],
  exports: [EgressService],
})
export class EgressModule {}
