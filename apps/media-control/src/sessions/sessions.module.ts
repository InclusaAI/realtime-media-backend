import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionEventController } from './session-event.controller';
import { KafkaEventsDocsController } from './kafka-events-docs.controller';
import { AudioTapModule } from '../audio-tap/audio-tap.module';
import { EgressModule } from '../egress/egress.module';
import { KafkaAdminModule } from '../kafka/kafka-admin.module';
import { getKafkaClientOptions } from '../config/kafka.config';

@Module({
  imports: [
    AudioTapModule,
    EgressModule,
    KafkaAdminModule,
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
  controllers: [KafkaEventsDocsController, SessionsController, SessionEventController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
