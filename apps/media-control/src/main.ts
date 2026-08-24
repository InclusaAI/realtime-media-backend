import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { Logger } from "@nestjs/common";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { ConfigService } from "@nestjs/config";
import { MediaControlModule } from "./media-control.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  const app = await NestFactory.create(MediaControlModule);

  // Connect microservice transport for Kafka consumers
  const configService = app.get(ConfigService);
  const brokers = configService.get<string[]>("kafka.brokers") || [
    "localhost:9092",
  ];

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers,
      },
      consumer: {
        groupId: "realtime-media-backend",
      },
    },
  });

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
    .addTag("Sessions", "Media session management REST endpoints")
    .addTag("Egress", "Media egress WebSocket protocol documentation")
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

  // Graceful shutdown
  const shutdownSignals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

  for (const signal of shutdownSignals) {
    process.on(signal, async () => {
      logger.log(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        await app.close();
        logger.log("Application closed successfully");
        process.exit(0);
      } catch (error) {
        logger.error("Error during graceful shutdown", error);
        process.exit(1);
      }
    });
  }

  // Start microservice (Kafka consumers)
  await app.startAllMicroservices();

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`🎬 Realtime Media Backend running on http://localhost:${port}`);
  logger.log(
    `📚 API Documentation available at http://localhost:${port}/api/docs`,
  );
  logger.log(
    `🔌 Kafka microservice connected and consuming events`,
  );
}

bootstrap();
