import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionEventController } from './session-event.controller';
import { KafkaEventsDocsController } from './kafka-events-docs.controller';
import { AudioTapModule } from '../audio-tap/audio-tap.module';
import { EgressModule } from '../egress/egress.module';

@Module({
  imports: [
    AudioTapModule,
    EgressModule,
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              brokers: configService.get<string[]>('kafka.brokers'),
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [SessionsController, SessionEventController, KafkaEventsDocsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
