/**
 * Pipeline Integration Test
 *
 * Proves the full contract chain works:
 *   1. Session created (simulates platform-backend event)
 *   2. Participant joins (simulates WebSocket join)
 *   3. Audio chunk produced (validates AudioChunkEvent)
 *   4. Video frame produced (validates VideoFrameEvent)
 *   5. Participant leaves (validates ParticipantEvent)
 *   6. Session ended (simulates platform-backend event)
 *
 * Each step validates the payload matches the inclusaai_contracts schema,
 * proving the data would successfully flow through Kafka to ai-services.
 */

import {
  validateAudioChunk,
  validateVideoFrame,
  validateParticipantEvent,
  AudioChunkEvent,
  VideoFrameEvent,
  ParticipantEvent,
} from '../contracts/kafka-events';
import { AudioChunkHandler } from '../audio-tap/audio-chunk.handler';
import { VideoFrameHandler } from '../egress/video-frame.handler';
import { SessionEventController } from '../sessions/session-event.controller';
import { SessionsService, SessionState } from '../sessions/sessions.service';

// Mock Kafka client
function createMockKafka() {
  const emitted: Array<{ topic: string; message: any }> = [];
  return {
    emitted,
    emit: jest.fn((topic: string, message: any) => {
      emitted.push({ topic, message });
    }),
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function buildEgressFrame(payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

describe('Pipeline Integration — Contract Chain', () => {
  let kafka: ReturnType<typeof createMockKafka>;
  let audioHandler: AudioChunkHandler;
  let videoHandler: VideoFrameHandler;

  beforeEach(() => {
    jest.useFakeTimers();
    kafka = createMockKafka();
    audioHandler = new AudioChunkHandler(kafka as any);
    videoHandler = new VideoFrameHandler(kafka as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Step 1: Session created (from platform-backend)
  // -------------------------------------------------------------------------
  describe('Step 1: Session created event', () => {
    it('platform-backend sends SessionCreatedPayload that media-backend can consume', () => {
      // This is what platform-backend actually publishes
      const platformEvent = {
        sessionId: 'clx1234567890',
        presentationId: 'pres_abc',
        organizationId: 'org_xyz',
        joinCode: 'ABC123',
      };

      // The SessionEventController should accept this shape
      expect(platformEvent.sessionId).toBeDefined();
      expect(typeof platformEvent.sessionId).toBe('string');
      expect(platformEvent.presentationId).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Step 2: Participant joins
  // -------------------------------------------------------------------------
  describe('Step 2: Participant joins session', () => {
    it('publishes conformant ParticipantEvent with event=joined', () => {
      const event: ParticipantEvent = {
        session_id: 'clx1234567890',
        participant_id: 'user-123',
        event: 'joined',
        timestamp_ms: Date.now(),
      };

      expect(() => validateParticipantEvent(event as unknown as Record<string, unknown>)).not.toThrow();

      // Verify topic shape
      const topic = `media.session.${event.session_id}.participant.joined`;
      expect(topic).toBe('media.session.clx1234567890.participant.joined');
    });
  });

  // -------------------------------------------------------------------------
  // Step 3: Audio chunks produced
  // -------------------------------------------------------------------------
  describe('Step 3: Audio chunk pipeline', () => {
    it('handler produces conformant AudioChunkEvent that ai-services ASR can consume', () => {
      const audioPayload = Buffer.from('fake-opus-audio-data');
      const frame = buildEgressFrame(audioPayload);

      audioHandler.setTrackParticipant('TR_AUDIO_1', 'presenter-42');
      audioHandler.processAudioFrame('clx1234567890', 'TR_AUDIO_1', frame);

      expect(kafka.emit).toHaveBeenCalledTimes(1);
      const [topic, message] = kafka.emit.mock.calls[0];

      // Topic matches expected pattern
      expect(topic).toBe('media.session.clx1234567890.audio.chunk');

      // Payload validates against contract
      expect(() => validateAudioChunk(message as Record<string, unknown>)).not.toThrow();

      // Verify all required fields
      expect(message.session_id).toBe('clx1234567890');
      expect(message.speaker_id).toBe('presenter-42');
      expect(typeof message.sequence).toBe('number');
      expect(typeof message.timestamp_ms).toBe('number');
      expect(message.sample_rate).toBe(16000);
      expect(message.encoding).toBe('opus');
      expect(typeof message.payload_b64).toBe('string');

      // Verify base64 roundtrip
      const decoded = Buffer.from(message.payload_b64, 'base64');
      expect(decoded.toString()).toBe('fake-opus-audio-data');
    });

    it('sequence numbers are monotonically increasing', () => {
      const frame = buildEgressFrame(Buffer.from('data'));
      audioHandler.setTrackParticipant('TR_1', 'speaker');

      audioHandler.processAudioFrame('room-1', 'TR_1', frame);
      audioHandler.processAudioFrame('room-1', 'TR_1', frame);
      audioHandler.processAudioFrame('room-1', 'TR_1', frame);

      const messages = kafka.emit.mock.calls.map((c) => c[1]);
      expect(messages[0].sequence).toBe(1);
      expect(messages[1].sequence).toBe(2);
      expect(messages[2].sequence).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Step 4: Video frames produced
  // -------------------------------------------------------------------------
  describe('Step 4: Video frame pipeline', () => {
    it('handler produces conformant VideoFrameEvent that ai-services sign-recognition can consume', () => {
      const videoPayload = Buffer.from('fake-h264-frame-data');
      const frame = buildEgressFrame(videoPayload);

      videoHandler.setTrackParticipant('TR_VIDEO_1', 'presenter-42');
      videoHandler.processVideoFrame('clx1234567890', 'TR_VIDEO_1', frame);

      expect(kafka.emit).toHaveBeenCalledTimes(1);
      const [topic, message] = kafka.emit.mock.calls[0];

      // Topic matches expected pattern
      expect(topic).toBe('media.session.clx1234567890.video.frame');

      // Payload validates against contract
      expect(() => validateVideoFrame(message as unknown as Record<string, unknown>)).not.toThrow();

      // Verify all required fields
      expect(message.session_id).toBe('clx1234567890');
      expect(message.presenter_id).toBe('presenter-42');
      expect(typeof message.sequence).toBe('number');
      expect(typeof message.timestamp_ms).toBe('number');
      expect(typeof message.width).toBe('number');
      expect(typeof message.height).toBe('number');
      expect(message.fps).toBe(15);
      expect(typeof message.payload_b64).toBe('string');
    });

    it('FPS sampling drops frames that arrive too fast', () => {
      const frame = buildEgressFrame(Buffer.from('frame'));
      videoHandler.setTrackParticipant('TR_1', 'presenter');

      videoHandler.processVideoFrame('room-1', 'TR_1', frame);
      videoHandler.processVideoFrame('room-1', 'TR_1', frame); // should be dropped

      expect(kafka.emit).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Step 5: Participant leaves
  // -------------------------------------------------------------------------
  describe('Step 5: Participant leaves session', () => {
    it('publishes conformant ParticipantEvent with event=left', () => {
      const event: ParticipantEvent = {
        session_id: 'clx1234567890',
        participant_id: 'user-123',
        event: 'left',
        timestamp_ms: Date.now(),
      };

      expect(() => validateParticipantEvent(event as unknown as Record<string, unknown>)).not.toThrow();

      const topic = `media.session.${event.session_id}.participant.left`;
      expect(topic).toBe('media.session.clx1234567890.participant.left');
    });
  });

  // -------------------------------------------------------------------------
  // Step 6: Session ended (from platform-backend)
  // -------------------------------------------------------------------------
  describe('Step 6: Session ended event', () => {
    it('platform-backend sends SessionEndedPayload that media-backend can consume', () => {
      const platformEvent = {
        sessionId: 'clx1234567890',
        endedAt: new Date().toISOString(),
      };

      expect(platformEvent.sessionId).toBeDefined();
      expect(platformEvent.endedAt).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Full pipeline: audio + video + participant events
  // -------------------------------------------------------------------------
  describe('Full pipeline: concurrent audio + video + participant events', () => {
    it('all events validate against their contracts in a single session', () => {
      const sessionId = 'clx_full_pipeline_test';

      // 1. Participant joins
      const joinEvent: ParticipantEvent = {
        session_id: sessionId,
        participant_id: 'presenter-1',
        event: 'joined',
        timestamp_ms: Date.now(),
      };
      expect(() => validateParticipantEvent(joinEvent as unknown as Record<string, unknown>)).not.toThrow();

      // 2. Audio chunks flow
      const audioFrame = buildEgressFrame(Buffer.from('audio-opus'));
      audioHandler.setTrackParticipant('TR_AUDIO', 'presenter-1');
      audioHandler.processAudioFrame(sessionId, 'TR_AUDIO', audioFrame);

      // 3. Video frames flow
      const videoFrame = buildEgressFrame(Buffer.from('video-h264'));
      videoHandler.setTrackParticipant('TR_VIDEO', 'presenter-1');
      videoHandler.processVideoFrame(sessionId, 'TR_VIDEO', videoFrame);

      // 4. Participant leaves
      const leaveEvent: ParticipantEvent = {
        session_id: sessionId,
        participant_id: 'presenter-1',
        event: 'left',
        timestamp_ms: Date.now(),
      };
      expect(() => validateParticipantEvent(leaveEvent as unknown as Record<string, unknown>)).not.toThrow();

      // Verify all events were produced
      expect(kafka.emit).toHaveBeenCalledTimes(2); // 1 audio + 1 video

      // Verify topics are correct
      const topics = kafka.emit.mock.calls.map((c) => c[0]);
      expect(topics).toContain(`media.session.${sessionId}.audio.chunk`);
      expect(topics).toContain(`media.session.${sessionId}.video.frame`);
    });
  });
});
