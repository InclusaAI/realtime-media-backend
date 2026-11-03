import { ConfigService, registerAs } from "@nestjs/config";
import {
  KafkaClientOptions,
  buildKafkaClientOptions,
} from "./kafka-client-options";

/**
 * Registers the resolved Kafka client options under the `kafka` namespace so
 * they can be injected anywhere via `ConfigService`. The resolution itself
 * lives in `kafka-client-options.ts` (env vars in, kafkajs options out) and is
 * shared by the standalone `kafkajs` admin client in the health check.
 */
export default registerAs(
  "kafka",
  (): KafkaClientOptions => buildKafkaClientOptions(),
);

/**
 * Read the Kafka client options registered by {@link kafkaConfig}.
 *
 * Falls back to building them straight from `process.env` so this stays safe to
 * call before `ConfigModule` has initialised (e.g. from a unit test that only
 * provides a bare `ConfigService`).
 */
export function getKafkaClientOptions(
  configService: ConfigService,
): KafkaClientOptions {
  return (
    configService.get<KafkaClientOptions>("kafka") ?? buildKafkaClientOptions()
  );
}