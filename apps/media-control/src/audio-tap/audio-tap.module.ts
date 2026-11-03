import { Module } from '@nestjs/common';
import { AudioTapService } from './audio-tap.service';
import { SfuAdapterModule } from '../sfu-adapter/sfu-adapter.module';
import { EgressModule } from '../egress/egress.module';
import { TrackDiscoveryService } from './track-discovery.service';
import {
  LiveKitWebhookController,
  WebhookReceiverFactory,
} from './livekit-webhook.controller';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [SfuAdapterModule, EgressModule, KafkaModule],
  controllers: [LiveKitWebhookController],
  providers: [
    AudioTapService,
    TrackDiscoveryService,
    WebhookReceiverFactory,
  ],
  exports: [AudioTapService, TrackDiscoveryService],
})
export class AudioTapModule {}
