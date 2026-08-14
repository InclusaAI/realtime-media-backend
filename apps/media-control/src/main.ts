import { NestFactory } from '@nestjs/core';
import { MediaControlModule } from './media-control.module';

async function bootstrap() {
  const app = await NestFactory.create(MediaControlModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
