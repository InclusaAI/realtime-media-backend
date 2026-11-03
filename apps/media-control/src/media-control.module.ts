import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { SfuAdapterModule } from "./sfu-adapter/sfu-adapter.module";
import { MediaControlController } from "./media-control.controller";
import { MediaControlService } from "./media-control.service";
import kafkaConfig, { getKafkaClientOptions } from "./config/kafka.config";
import aiServicesConfig from "./config/ai-services.config";
import { AudioTapModule } from "./audio-tap/audio-tap.module";
import { EgressModule } from "./egress/egress.module";
import { HealthCheckModule } from "./health/health-check.module";
import { join } from 'path';
import { IsString, IsNotEmpty, IsNumber, IsUrl, IsOptional, IsIn, validateSync } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { SessionsModule } from './sessions/sessions.module';
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

  // Broker list. KAFKA_BOOTSTRAP_SERVERS is primary; KAFKA_BROKERS is the
  // legacy alias. Both are optional here because `validate()` enforces that at
  // least one is set.
  @IsOptional()
  @IsString()
  KAFKA_BOOTSTRAP_SERVERS?: string;

  @IsOptional()
  @IsString()
  KAFKA_BROKERS?: string;

  // Security vars are optional: unset means plaintext, which is what local
  // Redpanda dev needs. Set together for a managed SASL_SSL broker.
  @IsOptional()
  @IsIn(['PLAINTEXT', 'SASL_PLAINTEXT', 'SSL', 'SASL_SSL'])
  KAFKA_SECURITY_PROTOCOL?: string;

  @IsOptional()
  @IsString()
  KAFKA_SASL_MECHANISM?: string;

  @IsOptional()
  @IsString()
  KAFKA_USERNAME?: string;

  @IsOptional()
  @IsString()
  KAFKA_PASSWORD?: string;

  /** Path to a PEM CA file, or the inline PEM body. See kafka-client-options.ts. */
  @IsOptional()
  @IsString()
  KAFKA_CA_CERT?: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;
}

/**
 * Enforce the "at least one broker variable" rule that class-validator cannot
 * express declaratively, and reject half-configured SASL credentials (a
 * username with no password would otherwise fail deep inside the handshake).
 */
function validateKafkaEnv(config: Record<string, unknown>): string[] {
  const errors: string[] = [];

  const brokers =
    config.KAFKA_BOOTSTRAP_SERVERS || config.KAFKA_BROKERS;
  if (!brokers || String(brokers).trim() === '') {
    errors.push(
      'KAFKA_BOOTSTRAP_SERVERS: a broker list is required ' +
        '(or the legacy KAFKA_BROKERS alias).',
    );
  }

  const username = config.KAFKA_USERNAME;
  const password = config.KAFKA_PASSWORD;
  if (username && !password) {
    errors.push('KAFKA_PASSWORD: required when KAFKA_USERNAME is set.');
  }
  if (password && !username) {
    errors.push('KAFKA_USERNAME: required when KAFKA_PASSWORD is set.');
  }

  return errors;
}

function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    forbidUnknownValues: false,
  });

  const kafkaErrors = validateKafkaEnv(config);
  if (errors.length > 0 || kafkaErrors.length > 0) {
    throw new Error(
      [...errors.map(String), ...kafkaErrors].join('\n') ||
        'Environment validation failed',
    );
  }
  return validatedConfig;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [kafkaConfig, aiServicesConfig],
      isGlobal: true,
      envFilePath: join(__dirname, '..', '..', '..', '.env'),
      validate,
    }),
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