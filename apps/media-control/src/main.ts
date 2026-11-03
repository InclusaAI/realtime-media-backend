import 'reflect-metadata';
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { Logger, ValidationPipe } from "@nestjs/common";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { ConfigService } from "@nestjs/config";
import { MediaControlModule } from "./media-control.module";
import {
  getKafkaClientOptions,
} from "./config/kafka.config";
import { summarizeKafkaClientOptions } from "./config/kafka-client-options";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  // rawBody is required by the LiveKit webhook endpoint: the request signature
  // is computed over the exact bytes sent, so a re-serialised JSON body would
  // not verify. Opt-in, so it costs a Buffer copy on JSON routes only.
  const app = await NestFactory.create(MediaControlModule, {
    rawBody: true,
  });

  // Enable global DTO validation (class-validator decorators)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Connect microservice transport for Kafka consumers
  const configService = app.get(ConfigService);
  const kafkaClientOptions = getKafkaClientOptions(configService);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: kafkaClientOptions,
      consumer: {
        groupId: "realtime-media-backend",
      },
      // Retry connecting to Kafka indefinitely so the server
      // can start even when Kafka is not available (e.g. local dev)
      retry: {
        retries: Infinity,
        initialRetryTime: 1000,
        maxRetryTime: 30000,
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
  const swaggerOptions = {
    customSiteTitle: "Realtime Media Backend API",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
  };

  // Support the short URL and retain the existing versioned documentation URL.
  SwaggerModule.setup("docs", app, document, swaggerOptions);
  SwaggerModule.setup("api/docs", app, document, swaggerOptions);

  // Enable CORS for local testing
  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  });

  const port = configService.get<number>("PORT") || 3001;

  // Start HTTP server FIRST
  await app.listen(port);
  logger.log(`🎬 Realtime Media Backend running on http://localhost:${port}`);
  logger.log(`📚 API Documentation available at http://localhost:${port}/docs`);
  logger.log(
    `📚 API Documentation (legacy URL) available at http://localhost:${port}/api/docs`,
  );

  // Start Kafka microservice AFTER HTTP server is up.
  // Use startAllMicroservices() without blocking — it will retry
  // Kafka connections in the background indefinitely.
  logger.log(
    `🔌 Kafka client configured: ${summarizeKafkaClientOptions(kafkaClientOptions)}`,
  );

  try {
    await app.startAllMicroservices();
    logger.log(`🔌 Kafka microservice connected and consuming events`);
  } catch (error) {
    logger.warn(
      `⚠️  Kafka microservice failed to connect (will retry in background)`,
    );
    logger.debug(error);
  }

  // Graceful shutdown
  const shutdownSignals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

  for (const signal of shutdownSignals) {
    process.on(signal, async () => {
      logger.log(`Received ${signal}, starting graceful shutdown...`);

      try {
        await app.close();
        logger.log("Application closed successfully");
        process.exit(0);
      } catch (error) {
        logger.error("Error during graceful shutdown", error);
        process.exit(1);
      }
    });
  }
}

bootstrap();
