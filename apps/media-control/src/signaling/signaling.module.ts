import { Module } from '@nestjs/common';
import { SignalingController } from './signaling.controller';
import { SignalingGateway } from './signaling.gateway';
import { SfuAdapterModule } from '../sfu-adapter/sfu-adapter.module';
import { AudioTapModule } from '../audio-tap/audio-tap.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    SfuAdapterModule,
    AudioTapModule,
    SessionsModule,
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
  controllers: [SignalingController],
  providers: [SignalingGateway],
  exports: [SignalingGateway],
})
export class SignalingModule {}
