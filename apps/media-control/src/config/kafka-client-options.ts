/**
 * Kafka client options derived from `KAFKA_*` env vars.
 *
 * The variable names are deliberately identical to ai-services
 * (`shared/kafka_clients/src/inclusaai_kafka_clients/security.py`) so both ends
 * of the media firehose are configured from one contract:
 *
 *   KAFKA_BOOTSTRAP_SERVERS  comma-separated brokers. Primary name.
 *   KAFKA_BROKERS            legacy alias, kept so local docker-compose dev
 *                            (Redpanda on localhost:9092) keeps working.
 *   KAFKA_SECURITY_PROTOCOL  PLAINTEXT | SASL_PLAINTEXT | SSL | SASL_SSL
 *   KAFKA_SASL_MECHANISM     SASL mechanism; defaults to scram-sha-256
 *   KAFKA_USERNAME           SASL username
 *   KAFKA_PASSWORD           SASL password
 *   KAFKA_CA_CERT            path to a PEM CA file, OR the inline PEM body
 *
 * Managed brokers (Aiven, Confluent Cloud, ...) sign their TLS chain with a
 * private CA that is not in the system trust store, so `KAFKA_CA_CERT` is
 * pinned onto the TLS options rather than relying on the OS bundle. Both a
 * filesystem path and an inline PEM body are accepted, because single-file
 * hosts (Render, container orchestrators) set the PEM directly as an env var
 * and have nowhere to mount a file.
 *
 * Kept free of Nest imports so it can be unit-tested directly.
 */

import { readFileSync } from 'fs';
import type { ConnectionOptions } from 'tls';
import type { SASLMechanism, SASLOptions } from 'kafkajs';

const PEM_HEADER = '-----BEGIN CERTIFICATE-----';

/** Aiven's default; also what ai-services falls back to. */
const DEFAULT_SASL_MECHANISM = 'scram-sha-256';

const SUPPORTED_SASL_MECHANISMS: SASLMechanism[] = [
  'plain',
  'scram-sha-256',
  'scram-sha-512',
];

/**
 * The subset of `KafkaConfig` this service ever sets. `KafkaConfig` itself is
 * not exported by kafkajs' type declarations, so it is restated here. `sasl`
 * reuses kafkajs' own union rather than restating it, so the two cannot drift.
 */
export interface KafkaClientOptions {
  brokers: string[];
  ssl?: ConnectionOptions | boolean;
  sasl?: SASLOptions;
}

/**
 * Resolve the broker list. `KAFKA_BOOTSTRAP_SERVERS` wins over the legacy
 * `KAFKA_BROKERS` alias; falls back to the local Redpanda dev broker.
 */
export function resolveKafkaBrokers(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = env.KAFKA_BOOTSTRAP_SERVERS || env.KAFKA_BROKERS || 'localhost:9092';

  const brokers = raw
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);

  if (brokers.length === 0) {
    throw new Error(
      'No Kafka brokers configured: set KAFKA_BOOTSTRAP_SERVERS (or KAFKA_BROKERS).',
    );
  }

  return brokers;
}

/**
 * Read the CA certificate, accepting either an inline PEM body or a path to a
 * PEM file. Throws with an actionable message when a path is unreadable —
 * failing fast here beats a confusing `unable to get local issuer certificate`
 * from deep inside the TLS handshake.
 */
function resolveCaCertificate(env: NodeJS.ProcessEnv): string | undefined {
  const raw = env.KAFKA_CA_CERT?.trim();
  if (!raw) {
    return undefined;
  }

  if (raw.includes(PEM_HEADER)) {
    return raw;
  }

  try {
    return readFileSync(raw, 'utf8');
  } catch (error) {
    throw new Error(
      `KAFKA_CA_CERT is neither an inline PEM (missing "${PEM_HEADER}") ` +
        `nor a readable file at that path: ${(error as Error).message}`,
    );
  }
}

/**
 * Validate the SASL mechanism against kafkajs' supported set. Catching a typo
 * here beats an opaque failure from inside the SCRAM handshake.
 */
function resolveSaslMechanism(env: NodeJS.ProcessEnv): SASLMechanism {
  const raw = (
    env.KAFKA_SASL_MECHANISM?.trim() || DEFAULT_SASL_MECHANISM
  ).toLowerCase();

  if (!SUPPORTED_SASL_MECHANISMS.includes(raw as SASLMechanism)) {
    throw new Error(
      `KAFKA_SASL_MECHANISM: "${raw}" is not supported. ` +
        `Use one of: ${SUPPORTED_SASL_MECHANISMS.join(', ')}.`,
    );
  }

  return raw as SASLMechanism;
}

/**
 * Build kafkajs client options from the environment.
 *
 * With no `KAFKA_*` security vars set this returns `{ brokers }` alone, which
 * is exactly the previous behaviour — a plaintext client against local
 * Redpanda. Security is opt-in, so local dev is unaffected.
 */
export function buildKafkaClientOptions(
  env: NodeJS.ProcessEnv = process.env,
): KafkaClientOptions {
  const options: KafkaClientOptions = { brokers: resolveKafkaBrokers(env) };

  const username = env.KAFKA_USERNAME?.trim();
  const password = env.KAFKA_PASSWORD?.trim();

  if (Boolean(username) !== Boolean(password)) {
    const missing = username ? 'KAFKA_PASSWORD' : 'KAFKA_USERNAME';
    throw new Error(
      `${missing}: required when the other SASL credential is set. ` +
        'Both must be provided together.',
    );
  }

  // Credentials without an explicit protocol imply SASL_SSL, the managed-broker
  // default. Mirrors ai-services' `security_kwargs()` so both sides infer the
  // same thing from the same variables.
  let securityProtocol = env.KAFKA_SECURITY_PROTOCOL?.trim();
  if (!securityProtocol && username) {
    securityProtocol = 'SASL_SSL';
  }

  if (securityProtocol?.endsWith('SSL')) {
    const ca = resolveCaCertificate(env);
    // Without a CA we fall back to the system trust store, which is correct
    // for a public-CA broker and fails for a managed one — same behaviour as
    // ai-services. `summarizeKafkaClientOptions()` surfaces which case we are in.
    options.ssl = ca ? { ca: [ca] } : true;
  }

  if (username) {
    options.sasl = {
      mechanism: resolveSaslMechanism(env),
      username,
      password,
    } as SASLOptions;
  }

  return options;
}

/**
 * Human-readable summary of the client's security posture, for startup logs.
 * Never includes the password.
 */
export function summarizeKafkaClientOptions(
  options: KafkaClientOptions,
): string {
  const parts = [`brokers=${options.brokers.join(',')}`];

  if (options.sasl) {
    parts.push(`sasl=${options.sasl.mechanism}`);
  } else {
    parts.push('sasl=none');
  }

  if (options.ssl === true) {
    parts.push('tls=system-trust-store');
  } else if (options.ssl && typeof options.ssl === 'object') {
    parts.push(
      options.ssl.ca ? 'tls=pinned-ca' : 'tls=system-trust-store',
    );
  } else {
    parts.push('tls=off');
  }

  return parts.join(' ');
}