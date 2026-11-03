import { Module } from "@nestjs/common";
import { AudioTapService } from "./audio-tap.service";
import { SfuAdapterModule } from "../sfu-adapter/sfu-adapter.module";
import { EgressModule } from "../egress/egress.module";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { getKafkaClientOptions } from "../config/kafka.config";

@Module({
  imports: [
    SfuAdapterModule,
    EgressModule,
    ClientsModule.registerAsync([
      {
        name: "KAFKA_SERVICE",
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: getKafkaClientOptions(configService),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [AudioTapService],
  exports: [AudioTapService],
})
export class AudioTapModule {}
