import { Module } from "@nestjs/common";
import { AudioTapService } from "./audio-tap.service";
import { SfuAdapterModule } from "../sfu-adapter/sfu-adapter.module";
import { EgressModule } from "../egress/egress.module";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { ConfigModule, ConfigService } from "@nestjs/config";

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
  providers: [AudioTapService],
  exports: [AudioTapService],
})
export class AudioTapModule {}
