import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { MediaControlModule } from "./media-control.module";

async function bootstrap() {
  const app = await NestFactory.create(MediaControlModule);

  // Swagger Setup
  const config = new DocumentBuilder()
    .setTitle("Realtime Media Backend API")
    .setDescription(
      "WebRTC signaling, SFU integration, and real-time media session management",
    )
    .setVersion("1.0.0")
    .addTag("Media Control", "Media session management endpoints")
    .addTag("Signaling", "WebSocket signaling events")
    .addTag("Health", "Service health and readiness")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "JWT",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  // Enable CORS for local testing
  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🎬 Realtime Media Backend running on http://localhost:${port}`);
  console.log(
    `📚 API Documentation available at http://localhost:${port}/api/docs`,
  );
}
bootstrap();
