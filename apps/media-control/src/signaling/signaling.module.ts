import { Module } from '@nestjs/common';
import { SignalingController } from './signaling.controller';

@Module({
  controllers: [SignalingController],
})
export class SignalingModule {}