import { NestFactory } from "@nestjs/core";
import { MediaControlModule } from "./media-control.module";

async function bootstrap() {
  const app = await NestFactory.create(MediaControlModule);
  await app.listen(3001);
}
bootstrap();
