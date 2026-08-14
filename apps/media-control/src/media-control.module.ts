import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { SfuAdapterModule } from "./sfu-adapter/src/sfu-adapter.module";
import { MediaControlController } from "./media-control.controller";
import { MediaControlService } from "./media-control.service";
import kafkaConfig from "./config/kafka.config";
import { AudioTapModule } from "./audio-tap/audio-tap.module";
import { EgressModule } from "./egress/egress.module";
import { HealthCheckModule } from "./health/health-check.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [kafkaConfig],
      isGlobal: true,
    }),
    ClientsModule.registerAsync([
      {
        name: "KAFKA_SERVICE",
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              brokers: configService.get<string[]>("kafka.brokers"),
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
    SfuAdapterModule,
    AudioTapModule,
    EgressModule,
    HealthCheckModule,
  ],
  controllers: [MediaControlController],
  providers: [MediaControlService],
})
export class MediaControlModule {}
