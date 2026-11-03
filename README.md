# realtime-media-backend

This repository handles the real-time media plane, separate from normal business APIs.

## Render deployment

The Blueprint uses Render's free web-service tier. Free instances spin down after inactivity and may take time to become available again.

1. Create a Render **Blueprint** from this repository; Render will read `render.yaml`.
2. Set the prompted values for LiveKit, Kafka/Aiven, and Redis.
3. Set `JWT_SECRET` to the exact same value used by the identity service.
4. Set `KAFKA_CA_CERT` to the broker CA PEM when required (inline PEM is supported).
5. Deploy and verify `GET /health/ready` returns HTTP 200.

Swagger is available at `/api/docs` after deployment.

The Docker image builds the NestJS application with Node 20 and runs the compiled production entry point.

## Required environment

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Must match the identity service |
| `LIVEKIT_SERVER_URL` | LiveKit server URL |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit credentials |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka/Aiven broker list |
| `KAFKA_SECURITY_PROTOCOL` | Use `SASL_SSL` for managed Kafka |
| `KAFKA_USERNAME` / `KAFKA_PASSWORD` | Kafka SASL credentials |
| `KAFKA_CA_CERT` | Kafka CA PEM, path or inline value, when required |
| `REDIS_URL` | Managed Redis connection URL |
