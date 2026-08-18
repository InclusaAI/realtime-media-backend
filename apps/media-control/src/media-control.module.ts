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
import { IsString, IsNotEmpty, IsNumber, IsUrl, validateSync } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { SessionsModule } from './sessions/sessions.module'; // Import the new module
import { SignalingModule } from "./signaling/signaling.module";

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  NODE_ENV: string;

  @IsNumber()
  @IsNotEmpty()
  PORT: number;

  @IsString()
  @IsNotEmpty()
  LOG_LEVEL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  LIVEKIT_SERVER_URL: string;

  @IsString()
  @IsNotEmpty()
  LIVEKIT_API_KEY: string;

  @IsString()
  @IsNotEmpty()
  LIVEKIT_API_SECRET: string;

  @IsString()
  @IsNotEmpty()
  KAFKA_BROKERS: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;
}

function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [kafkaConfig],
      isGlobal: true,
      validate,
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
    SessionsModule, 
    SignalingModule, 
  ],
  controllers: [MediaControlController],
  providers: [MediaControlService],
})
export class MediaControlModule {}