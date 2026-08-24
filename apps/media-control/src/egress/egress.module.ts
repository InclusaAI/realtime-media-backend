import { Module } from "@nestjs/common";
import { EgressService } from "./egress.service";
import { EgressController } from "./egress.controller";
import { SfuAdapterModule } from "../sfu-adapter/sfu-adapter.module";
import { AudioChunkHandler } from "../audio-tap/audio-chunk.handler";
import { EgressDocsController } from "./egress-docs.controller";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    SfuAdapterModule,
    ClientsModule.registerAsync([
      {
        name: "KAFKA_SERVICE",
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              brokers: configService.get<string[]>("kafka.brokers") || [
                "localhost:9092",
              ],
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [EgressDocsController],
  providers: [EgressService, EgressController, AudioChunkHandler],
  exports: [EgressService, EgressController, AudioChunkHandler],
})
export class EgressModule {}
