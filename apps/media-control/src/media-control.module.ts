import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { SfuAdapterModule } from "./sfu-adapter/src/sfu-adapter.module";
import { MediaControlController } from "./media-control.controller";
import { MediaControlService } from "./media-control.service";
import kafkaConfig from "./config/kafka.config";

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [kafkaConfig],
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
  ],
  controllers: [MediaControlController],
  providers: [MediaControlService],
})
export class MediaControlModule {}
