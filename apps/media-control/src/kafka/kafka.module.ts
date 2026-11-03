import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { getKafkaClientOptions } from '../config/kafka.config';

/**
 * Owns the single `KAFKA_SERVICE` producer client for the whole service.
 *
 * `ClientsModule.registerAsync` creates one client per *registration*, and each
 * registration opens its own KafkaJS producer — its own TCP connection, and its
 * own TLS handshake when the broker is SASL_SSL. That registration previously
 * appeared in four modules, so the service held four redundant authenticated
 * connections to Aiven.
 *
 * Registering here once and exporting the token means every consumer shares one
 * producer. Consumers must import this module rather than re-registering.
 */
@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_SERVICE',
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
  exports: ['KAFKA_SERVICE'],
})
export class KafkaModule {}