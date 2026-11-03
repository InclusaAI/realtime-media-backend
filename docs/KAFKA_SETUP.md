# Kafka Configuration

How `realtime-media-backend` connects to Kafka, and which topics it expects to exist.

## Environment variables

The variable names are intentionally identical to ai-services
(`ai-services/shared/kafka_clients/src/inclusaai_kafka_clients/security.py`), so
both ends of the media firehose are configured from one contract.

| Variable | Default | Purpose |
|----------|---------|---------|
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Comma-separated broker list. Primary name. |
| `KAFKA_BROKERS` | — | Legacy alias, honoured when the above is unset. |
| `KAFKA_SECURITY_PROTOCOL` | unset (= plaintext) | `PLAINTEXT` / `SASL_PLAINTEXT` / `SSL` / `SASL_SSL` |
| `KAFKA_SASL_MECHANISM` | `scram-sha-256` | Aiven's default. |
| `KAFKA_USERNAME` / `KAFKA_PASSWORD` | unset | SASL credentials. Both or neither. |
| `KAFKA_CA_CERT` | unset | PEM CA **file path** *or* the **inline PEM body**. |
| `KAFKA_TOPIC_PARTITIONS` | `3` | Partitions for provisioned topics. |
| `KAFKA_TOPIC_REPLICATION_FACTOR` | `3` | Replicas for provisioned topics. |
| `LIVEKIT_WEBHOOKS_ENABLED` | `false` | Enable LiveKit webhook verification; when `true`, the service validates `Authorization` headers against raw request bodies at `POST /api/livekit/webhook`. See LiveKit server setup below. |

Resolution lives in `apps/media-control/src/config/kafka-client-options.ts` and
is shared by every client: the microservice consumer, the four
`KAFKA_SERVICE` producers, the health-check admin client, and the topic
provisioner.

### Local development (Redpanda)

Nothing but a broker list — no security vars:

```bash
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
```

This returns `{ brokers }` and nothing else, so TLS and SASL stay off.

### Managed brokers (Aiven)

```bash
KAFKA_BOOTSTRAP_SERVERS=kafka-<name>-<id>.l.aivencloud.com:<port>
KAFKA_SECURITY_PROTOCOL=SASL_SSL
KAFKA_SASL_MECHANISM=scram-sha-256
KAFKA_USERNAME=<sasl-username>
KAFKA_PASSWORD=<sasl-password>
KAFKA_CA_CERT=<path to PEM, or the inline PEM body>
```

Two things worth knowing:

- **`KAFKA_CA_CERT` is not optional.** Aiven signs its TLS chain with a private
  CA that is not in the Windows or Linux trust store, so omitting it fails the
  handshake with `unable to get local issuer certificate`. The PEM is pinned
  onto the TLS options rather than replacing the system store, so public roots
  keep working.
- **It takes a path *or* an inline PEM.** Single-file hosts (Render, container
  orchestrators) have nowhere to mount a file, so a PEM body in the env var is
  detected and used directly — no temp file, unlike the Python client.

Setting `KAFKA_USERNAME`/`KAFKA_PASSWORD` without `KAFKA_SECURITY_PROTOCOL`
implies `SASL_SSL`, matching `security_kwargs()` in ai-services.

## Topics

### Inbound (this service consumes)

| Topic | Handler |
|-------|---------|
| `session.created` | `SessionEventController.handleSessionCreated` |
| `session.ended`   | `SessionEventController.handleSessionEnded` |

These are published by platform-backend's session-service. They must exist
before this service's consumer group can join — with auto-creation disabled the
consumer fails with `UNKNOWN_TOPIC_OR_PARTITION`
("This server does not host this topic-partition").

### Outbound (this service publishes)

Per-session, so they cannot be created ahead of time:

```
media.session.<sessionId>.audio.chunk          -> asr-service
media.session.<sessionId>.video.frame          -> sign-recognition-service, vision-quality-service
media.session.<sessionId>.participant.joined   -> engagement-service
media.session.<sessionId>.participant.left     -> engagement-service
media.session.<sessionId>.audio.metadata       -> internal (track lifecycle)
media.session.<sessionId>.video.metadata       -> internal (track lifecycle)
```

`KafkaAdminService` creates all six when `session.created` arrives, before the
media tap starts, so the first `emit()` cannot race topic creation. Creation is
idempotent, honours `KAFKA_TOPIC_PARTITIONS` / `KAFKA_TOPIC_REPLICATION_FACTOR`,
and falls back to a replication factor of 1 when the cluster cannot satisfy the
requested one (single-broker local Redpanda). A provisioning failure is logged,
not thrown — it must not abort session setup.

### Session ids

`sessionId` arrives over the wire and is interpolated into topic names, so it is
validated against `[A-Za-z0-9_-]+` before use. Dots are rejected deliberately:
ai-services resolves a concrete topic back to an event key with
`^media\.session\.[^.]+\.audio\.chunk$`, so a dotted id would publish
successfully but never resolve, silently dropping the message.

## Verifying

Startup logs the resolved posture (never the password):

```
Kafka client configured: brokers=kafka-...l.aivencloud.com:27345 sasl=scram-sha-256 tls=pinned-ca
```

`tls=pinned-ca` means `KAFKA_CA_CERT` was found and pinned. `tls=system-trust-store`
means it was not — correct for a public-CA broker, but it will fail against
Aiven.

Then confirm the dependencies:

```bash
curl http://localhost:3001/health
```

```json
{
  "services": {
    "kafka": { "status": "up" },
    "redis": { "status": "up" },
    "livekit": { "status": "up" },
    "aiServices": {
      "signRecognition": { "status": "configured", "url": "..." },
      "avatarPose": { "status": "configured", "url": "..." }
    }
  }
}
```

`aiServices` is reported **without probing**: media travels over Kafka, so those
URLs are off the hot path, and Render free-tier services can cold-start for
~50s — probing them inline would stall the health endpoint.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `unable to get local issuer certificate` | Aiven's private CA not pinned | Set `KAFKA_CA_CERT` |
| `This server does not host this topic-partition` | Topic absent, auto-create off | Create it, or publish `session.created` to provision |
| `tls=system-trust-store` in startup log | `KAFKA_CA_CERT` unset | Set it |
| `KAFKA_PASSWORD: required when KAFKA_USERNAME is set` | Half-configured credentials | Set both |
| `KAFKA_SASL_MECHANISM: "..." is not supported` | Typo'd mechanism | Use `plain`, `scram-sha-256`, or `scram-sha-512` |
| `KAFKA_CA_CERT is neither an inline PEM...` | Bad path | Check the path, or paste the PEM body |

## LiveKit Webhook Server Setup

To enable push-based track discovery (recommended over polling), configure LiveKit to POST webhook events to this service:

### On the LiveKit server:

```yaml
webhook:
  enabled: true
  url: https://<your-host>/api/livekit/webhook
  secret: <shared-secret>  # must match LIVEKIT_API_KEY/LIVEKIT_API_SECRET
  events:
    - track_published
    - track_unpublished
    - participant_left
    - room_finished
```

### Verification

The webhook endpoint at `POST /api/livekit/webhook` expects:

- **Raw request body** (the exact bytes LiveKit signed)
- **Authorization header** containing a JWT signed with the same `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`

The Nest app is configured with `rawBody: true` in `main.ts` to support this.

### Events handled:

| Event | Action |
|-------|--------|
| `track_published` | `applyTrackPublished(room, trackSid, identity, kind)` |
| `track_unpublished` | `applyTrackUnpublished(room, trackSid)` |
| `participant_left` | `applyParticipantLeft(room, identity)` — drops all tracks for that participant |
| `room_finished` | `detachRoom(room)` — cleans up all track state |

### When to disable polling

Set `LIVEKIT_WEBHOOKS_ENABLED=true` in `.env`. The `TrackDiscoveryService` will then use webhook-delivered state instead of polling `listParticipants()` every `TRACK_POLL_INTERVAL_MS` (default 1000ms). Both can be active simultaneously — the polling path is a no-op when webhooks deliver the same state.

### Troubleshooting webhooks

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` | Missing or wrong `Authorization` header | Ensure `Authorization: Bearer <jwt>` where jwt is signed with `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` |
| `400 Bad Request` | Raw body unavailable | Ensure Nest was started with `--rawBody` flag (added to `main.ts`) |
| No events received | LiveKit misconfigured webhook URL/secret | Verify LiveKit server URL/secret match this service's credentials |

EOF