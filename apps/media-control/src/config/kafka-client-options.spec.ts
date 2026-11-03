import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildKafkaClientOptions,
  resolveKafkaBrokers,
  summarizeKafkaClientOptions,
} from './kafka-client-options';

const INLINE_PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIIERDCCAqygAwIBAgIUaJ1SMZiHT+gBz8Bo/txpGyhrlfkwDQYJKoZIhvcNAQEM',
  '-----END CERTIFICATE-----',
].join('\n');

/** A self-signed-looking credential pair; never sent anywhere. */
const USERNAME = 'avnadmin';
const PASSWORD = 'AVNS_test_password';

describe('kafka-client-options', () => {
  describe('resolveKafkaBrokers', () => {
    it('defaults to the local Redpanda dev broker', () => {
      expect(resolveKafkaBrokers({})).toEqual(['localhost:9092']);
    });

    it('reads KAFKA_BOOTSTRAP_SERVERS and splits/trims a comma list', () => {
      const env = { KAFKA_BOOTSTRAP_SERVERS: ' a:9092 , b:9092 ,c:9092 ' };
      expect(resolveKafkaBrokers(env)).toEqual(['a:9092', 'b:9092', 'c:9092']);
    });

    it('falls back to the legacy KAFKA_BROKERS alias', () => {
      expect(resolveKafkaBrokers({ KAFKA_BROKERS: 'legacy:9092' })).toEqual([
        'legacy:9092',
      ]);
    });

    it('prefers KAFKA_BOOTSTRAP_SERVERS over the legacy alias', () => {
      const env = {
        KAFKA_BOOTSTRAP_SERVERS: 'primary:9092',
        KAFKA_BROKERS: 'legacy:9092',
      };
      expect(resolveKafkaBrokers(env)).toEqual(['primary:9092']);
    });

    it('throws when the broker list is only separators/whitespace', () => {
      expect(() => resolveKafkaBrokers({ KAFKA_BROKERS: ' , , ' })).toThrow(
        /No Kafka brokers configured/,
      );
    });
  });

  describe('buildKafkaClientOptions', () => {
    describe('plaintext (local dev)', () => {
      it('returns brokers alone with no security when nothing is set', () => {
        expect(buildKafkaClientOptions({})).toEqual({
          brokers: ['localhost:9092'],
        });
      });

      it('leaves TLS and SASL off for an explicit PLAINTEXT protocol', () => {
        const options = buildKafkaClientOptions({
          KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092',
          KAFKA_SECURITY_PROTOCOL: 'PLAINTEXT',
        });

        expect(options.ssl).toBeUndefined();
        expect(options.sasl).toBeUndefined();
      });
    });

    describe('managed broker (Aiven)', () => {
      it('infers SASL_SSL when credentials are set without a protocol', () => {
        const options = buildKafkaClientOptions({
          KAFKA_BOOTSTRAP_SERVERS: 'kafka.example.com:27345',
          KAFKA_USERNAME: USERNAME,
          KAFKA_PASSWORD: PASSWORD,
        });

        // Managed-broker default, mirroring ai-services security_kwargs().
        expect(options.sasl).toEqual({
          mechanism: 'scram-sha-256',
          username: USERNAME,
          password: PASSWORD,
        });
      });

      it('defaults the SASL mechanism to scram-sha-256', () => {
        const options = buildKafkaClientOptions({
          KAFKA_USERNAME: USERNAME,
          KAFKA_PASSWORD: PASSWORD,
        });

        expect(options.sasl?.mechanism).toBe('scram-sha-256');
      });

      it('honours an explicit KAFKA_SASL_MECHANISM', () => {
        const options = buildKafkaClientOptions({
          KAFKA_USERNAME: USERNAME,
          KAFKA_PASSWORD: PASSWORD,
          KAFKA_SASL_MECHANISM: 'scram-sha-512',
        });

        expect(options.sasl?.mechanism).toBe('scram-sha-512');
      });

      it('trims whitespace around credentials', () => {
        const options = buildKafkaClientOptions({
          KAFKA_SECURITY_PROTOCOL: 'SASL_SSL',
          KAFKA_USERNAME: '  avnadmin  ',
          KAFKA_PASSWORD: '  secret  ',
        });

        expect(options.sasl).toMatchObject({
          username: 'avnadmin',
          password: 'secret',
        });
      });

      it('pins an inline PEM CA onto the TLS options', () => {
        const options = buildKafkaClientOptions({
          KAFKA_SECURITY_PROTOCOL: 'SASL_SSL',
          KAFKA_USERNAME: USERNAME,
          KAFKA_PASSWORD: PASSWORD,
          KAFKA_CA_CERT: INLINE_PEM,
        });

        expect(options.ssl).toEqual({ ca: [INLINE_PEM] });
      });

      it('accepts SSL without SASL credentials', () => {
        const options = buildKafkaClientOptions({
          KAFKA_SECURITY_PROTOCOL: 'SSL',
          KAFKA_CA_CERT: INLINE_PEM,
        });

        expect(options.ssl).toEqual({ ca: [INLINE_PEM] });
        expect(options.sasl).toBeUndefined();
      });

      it('falls back to the system trust store when no CA is configured', () => {
        const options = buildKafkaClientOptions({
          KAFKA_SECURITY_PROTOCOL: 'SASL_SSL',
          KAFKA_USERNAME: USERNAME,
          KAFKA_PASSWORD: PASSWORD,
        });

        // `true` = TLS on with the OS bundle. Fails for Aiven's private CA,
        // which is why KAFKA_CA_CERT exists.
        expect(options.ssl).toBe(true);
      });

      it('keeps TLS off for SASL_PLAINTEXT even with credentials', () => {
        const options = buildKafkaClientOptions({
          KAFKA_SECURITY_PROTOCOL: 'SASL_PLAINTEXT',
          KAFKA_USERNAME: USERNAME,
          KAFKA_PASSWORD: PASSWORD,
        });

        expect(options.ssl).toBeUndefined();
        expect(options.sasl).toBeDefined();
      });

      it('rejects an unsupported SASL mechanism up front', () => {
        expect(() =>
          buildKafkaClientOptions({
            KAFKA_USERNAME: USERNAME,
            KAFKA_PASSWORD: PASSWORD,
            KAFKA_SASL_MECHANISM: 'scram-sha-1024',
          }),
        ).toThrow(/KAFKA_SASL_MECHANISM.*not supported/);
      });

      it('normalises mechanism casing', () => {
        const options = buildKafkaClientOptions({
          KAFKA_USERNAME: USERNAME,
          KAFKA_PASSWORD: PASSWORD,
          KAFKA_SASL_MECHANISM: 'SCRAM-SHA-512',
        });

        expect(options.sasl?.mechanism).toBe('scram-sha-512');
      });
    });

    describe('half-configured credentials', () => {
      it('rejects a username with no password', () => {
        expect(() =>
          buildKafkaClientOptions({ KAFKA_USERNAME: USERNAME }),
        ).toThrow(/KAFKA_PASSWORD: required/);
      });

      it('rejects a password with no username', () => {
        expect(() =>
          buildKafkaClientOptions({ KAFKA_PASSWORD: PASSWORD }),
        ).toThrow(/KAFKA_USERNAME: required/);
      });
    });

    describe('KAFKA_CA_CERT as a file path', () => {
      let dir: string;
      let caPath: string;

      beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), 'kafka-ca-test-'));
        caPath = join(dir, 'ca.pem');
        writeFileSync(caPath, INLINE_PEM, 'utf8');
      });

      afterAll(() => {
        rmSync(dir, { recursive: true, force: true });
      });

      it('reads the PEM from disk and pins it', () => {
        const options = buildKafkaClientOptions({
          KAFKA_SECURITY_PROTOCOL: 'SASL_SSL',
          KAFKA_USERNAME: USERNAME,
          KAFKA_PASSWORD: PASSWORD,
          KAFKA_CA_CERT: caPath,
        });

        expect(options.ssl).toEqual({ ca: [INLINE_PEM] });
      });

      it('throws an actionable error when the path is unreadable', () => {
        const missing = join(dir, 'does-not-exist.pem');

        expect(() =>
          buildKafkaClientOptions({
            KAFKA_SECURITY_PROTOCOL: 'SASL_SSL',
            KAFKA_CA_CERT: missing,
          }),
        ).toThrow(/KAFKA_CA_CERT is neither an inline PEM/);
      });
    });

    it('ignores an empty KAFKA_CA_CERT rather than treating it as a path', () => {
      const options = buildKafkaClientOptions({
        KAFKA_SECURITY_PROTOCOL: 'SASL_SSL',
        KAFKA_USERNAME: USERNAME,
        KAFKA_PASSWORD: PASSWORD,
        KAFKA_CA_CERT: '   ',
      });

      expect(options.ssl).toBe(true);
    });
  });

  describe('summarizeKafkaClientOptions', () => {
    it('never leaks the SASL password', () => {
      const summary = summarizeKafkaClientOptions(
        buildKafkaClientOptions({
          KAFKA_SECURITY_PROTOCOL: 'SASL_SSL',
          KAFKA_USERNAME: USERNAME,
          KAFKA_PASSWORD: PASSWORD,
          KAFKA_CA_CERT: INLINE_PEM,
        }),
      );

      expect(summary).not.toContain(PASSWORD);
      expect(summary).toContain('sasl=scram-sha-256');
      expect(summary).toContain('tls=pinned-ca');
    });

    it('reports a plaintext client as tls=off sasl=none', () => {
      const summary = summarizeKafkaClientOptions(
        buildKafkaClientOptions({ KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092' }),
      );

      expect(summary).toBe('brokers=localhost:9092 sasl=none tls=off');
    });

    it('distinguishes the system trust store from a pinned CA', () => {
      const summary = summarizeKafkaClientOptions({
        brokers: ['kafka:9092'],
        ssl: true,
      });

      expect(summary).toBe('brokers=kafka:9092 sasl=none tls=system-trust-store');
    });
  });
});