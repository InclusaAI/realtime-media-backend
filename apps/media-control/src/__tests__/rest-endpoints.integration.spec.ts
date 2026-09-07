/**
 * Integration Tests — All REST Endpoints
 *
 * These tests hit the REAL running service on localhost:3001.
 * Boot the service first:  npm run start:dev
 *
 * Run: npx jest --no-cache --testPathPattern integration-rest
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// ─── Helpers ──────────────────────────────────────────────────────────
async function api(method: string, path: string, body?: unknown) {
  const url = `${BASE_URL}${path}`;
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('REST Integration — All Endpoints', () => {
  let createdSessionId: string;

  // ──────────── Health ────────────────────

  describe('GET /health', () => {
    it('returns health status with all services listed', async () => {
      const { status, json } = await api('GET', '/health');
      expect(status).toBe(200);
      expect(json.status).toBeDefined();
      expect(json.timestamp).toBeDefined();
      expect(json.services).toBeDefined();
      expect(json.services.kafka).toBeDefined();
      expect(json.services.redis).toBeDefined();
      expect(json.services.livekit).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('returns readiness status', async () => {
      const { status, json } = await api('GET', '/health/ready');
      expect(status).toBe(200);
      expect(json.ready).toBeDefined();
      expect(typeof json.ready).toBe('boolean');
      expect(json.message).toBeDefined();
    });
  });

  // ──────────── Service Info ──────────────

  describe('GET /api', () => {
    it('returns service info', async () => {
      const { status, json } = await api('GET', '/api');
      expect(status).toBe(200);
    });
  });

  // ──────────── Swagger Docs ──────────────

  describe('GET /api/docs', () => {
    it('serves Swagger UI', async () => {
      const res = await fetch(`${BASE_URL}/api/docs`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('swagger');
    });
  });

  // ──────────── Sessions CRUD ─────────────

  describe('POST /api/sessions', () => {
    it('creates a new session with SPEECH mode', async () => {
      const { status, json } = await api('POST', '/api/sessions', {
        initiatorId: 'test-user-001',
        mode: 'SPEECH',
      });
      expect(status).toBe(201);
      expect(json.status).toBe('success');
      expect(json.data).toBeDefined();
      expect(json.data.id).toBeDefined();
      expect(json.data.state).toBe('active');
      expect(json.data.participants).toEqual([]);
      createdSessionId = json.data.id;
    });

    it('creates a session with SIGN_LANGUAGE mode', async () => {
      const { status, json } = await api('POST', '/api/sessions', {
        initiatorId: 'test-user-002',
        mode: 'SIGN_LANGUAGE',
      });
      expect(status).toBe(201);
      expect(json.data.id).toBeDefined();
    });

    it('creates a session with HYBRID mode', async () => {
      const { status, json } = await api('POST', '/api/sessions', {
        initiatorId: 'test-user-003',
        mode: 'HYBRID',
      });
      expect(status).toBe(201);
    });

    it('rejects invalid mode', async () => {
      const { status, json } = await api('POST', '/api/sessions', {
        initiatorId: 'test-user',
        mode: 'INVALID_MODE',
      });
      expect(status).toBe(400);
    });

    it('rejects missing initiatorId', async () => {
      const { status } = await api('POST', '/api/sessions', {
        mode: 'SPEECH',
      });
      expect(status).toBe(400);
    });
  });

  describe('GET /api/sessions/:sessionId', () => {
    it('returns session details for an existing session', async () => {
      const { status, json } = await api('GET', `/api/sessions/${createdSessionId}`);
      expect(status).toBe(200);
      expect(json.id).toBe(createdSessionId);
      expect(json.state).toBeDefined();
      expect(json.participants).toBeDefined();
      expect(json.metrics).toBeDefined();
    });

    it('returns 404 for nonexistent session', async () => {
      const { status } = await api('GET', '/api/sessions/nonexistent-session-xyz');
      expect(status).toBe(404);
    });
  });

  describe('GET /api/sessions/:sessionId/participants', () => {
    it('returns participant list for an existing session', async () => {
      const { status, json } = await api('GET', `/api/sessions/${createdSessionId}/participants`);
      expect(status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.data.participants).toBeDefined();
      expect(Array.isArray(json.data.participants)).toBe(true);
    });

    it('returns 404 for nonexistent session', async () => {
      const { status } = await api('GET', '/api/sessions/nonexistent/participants');
      expect(status).toBe(404);
    });
  });

  describe('GET /api/sessions/:sessionId/metrics', () => {
    it('returns metrics for an existing session', async () => {
      const { status, json } = await api('GET', `/api/sessions/${createdSessionId}/metrics`);
      expect(status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.data.metrics).toBeDefined();
      expect(typeof json.data.metrics.packetLoss).toBe('number');
      expect(typeof json.data.metrics.jitter).toBe('number');
      expect(typeof json.data.metrics.rtt).toBe('number');
      expect(typeof json.data.metrics.bitrate).toBe('number');
    });

    it('returns 404 for nonexistent session', async () => {
      const { status } = await api('GET', '/api/sessions/nonexistent/metrics');
      expect(status).toBe(404);
    });
  });

  describe('DELETE /api/sessions/:sessionId', () => {
    it('ends an existing session', async () => {
      const { status, json } = await api('DELETE', `/api/sessions/${createdSessionId}`);
      expect(status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.message).toContain(createdSessionId);
    });

    it('returns 404 for already-ended session', async () => {
      const { status } = await api('DELETE', `/api/sessions/${createdSessionId}`);
      expect(status).toBe(404);
    });
  });

  // ──────────── Documentation Endpoints ───

  describe('GET /api/signaling/events', () => {
    it('returns WebSocket event documentation', async () => {
      const { status, json } = await api('GET', '/api/signaling/events');
      expect(status).toBe(200);
      expect(json['client-to-server']).toBeDefined();
      expect(json['server-to-client']).toBeDefined();
      expect(json['client-to-server']['join-room']).toBeDefined();
      expect(json['client-to-server']['leave-room']).toBeDefined();
      expect(json['server-to-client']['token']).toBeDefined();
    });
  });

  describe('GET /api/egress/events', () => {
    it('returns Egress WebSocket documentation', async () => {
      const { status, json } = await api('GET', '/api/egress/events');
      expect(status).toBe(200);
      expect(json.namespace).toBe('/egress');
      expect(json.audioChunkSchema).toBeDefined();
      expect(json.videoFrameSchema).toBeDefined();
      expect(json.audioChunkSchema.topic).toContain('audio.chunk');
      expect(json.videoFrameSchema.topic).toContain('video.frame');
    });
  });

  describe('GET /api/docs/kafka-events', () => {
    it('returns Kafka event documentation', async () => {
      const { status, json } = await api('GET', '/api/docs/kafka-events');
      expect(status).toBe(200);
      expect(json.consumed).toBeDefined();
      expect(json.published).toBeDefined();
      expect(json.consumed['session.created']).toBeDefined();
      expect(json.published['media.session.*.audio.chunk']).toBeDefined();
    });
  });

  // ──────────── 404 for unknown routes ────

  describe('Unknown routes', () => {
    it('returns 404 for unknown API paths', async () => {
      const { status } = await api('GET', '/api/nonexistent');
      expect(status).toBe(404);
    });
  });
});
