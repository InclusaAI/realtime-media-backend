import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaAdminService } from './kafka-admin.service';
import { KafkaModule } from './kafka.module';

/**
 * Runtime topic provisioning. Exported so `SessionsModule` can create the
 * per-session `media.session.*` topics when `session.created` arrives.
 *
 * Imports `KafkaModule` to share its single Kafka client configuration
 * (imports of a module's exports are inherited transitively here).
 */
@Module({
  imports: [ConfigModule, KafkaModule],
  providers: [KafkaAdminService],
  exports: [KafkaAdminService],
})
export class KafkaAdminModule {}