import {
  validateAudioChunk,
  validateVideoFrame,
  validateParticipantEvent,
  Topics,
  AudioChunkEvent,
  VideoFrameEvent,
  ParticipantEvent,
} from './kafka-events';

describe('Kafka Event Contracts', () => {
  // ---------------------------------------------------------------------------
  // AudioChunkEvent
  // ---------------------------------------------------------------------------
  describe('validateAudioChunk', () => {
    const validPayload: AudioChunkEvent = {
      session_id: 'test-room',
      speaker_id: 'user-123',
      sequence: 1,
      timestamp_ms: Date.now(),
      sample_rate: 16000,
      encoding: 'opus',
      payload_b64: 'UklGRi...',
    };

    it('accepts a valid payload', () => {
      expect(() => validateAudioChunk(validPayload as unknown as Record<string, unknown>)).not.toThrow();
    });

    it('rejects payload missing session_id', () => {
      const { session_id, ...rest } = validPayload;
      expect(() => validateAudioChunk(rest as unknown as Record<string, unknown>)).toThrow('session_id');
    });

    it('rejects payload missing speaker_id', () => {
      const { speaker_id, ...rest } = validPayload;
      expect(() => validateAudioChunk(rest as unknown as Record<string, unknown>)).toThrow('speaker_id');
    });

    it('rejects payload missing sequence', () => {
      const { sequence, ...rest } = validPayload;
      expect(() => validateAudioChunk(rest as unknown as Record<string, unknown>)).toThrow('sequence');
    });

    it('rejects payload missing timestamp_ms', () => {
      const { timestamp_ms, ...rest } = validPayload;
      expect(() => validateAudioChunk(rest as unknown as Record<string, unknown>)).toThrow('timestamp_ms');
    });

    it('rejects payload missing payload_b64', () => {
      const { payload_b64, ...rest } = validPayload;
      expect(() => validateAudioChunk(rest as unknown as Record<string, unknown>)).toThrow('payload_b64');
    });

    it('rejects non-string session_id', () => {
      expect(() =>
        validateAudioChunk({ ...validPayload, session_id: 123 } as unknown as Record<string, unknown>),
      ).toThrow('session_id must be a string');
    });

    it('rejects non-number timestamp_ms', () => {
      expect(() =>
        validateAudioChunk({ ...validPayload, timestamp_ms: 'now' } as unknown as Record<string, unknown>),
      ).toThrow('timestamp_ms must be a number');
    });
  });

  // ---------------------------------------------------------------------------
  // VideoFrameEvent
  // ---------------------------------------------------------------------------
  describe('validateVideoFrame', () => {
    const validPayload: VideoFrameEvent = {
      session_id: 'test-room',
      presenter_id: 'user-123',
      sequence: 1,
      timestamp_ms: Date.now(),
      width: 1280,
      height: 720,
      fps: 15,
      payload_b64: 'AAAAIG...',
    };

    it('accepts a valid payload', () => {
      expect(() => validateVideoFrame(validPayload as unknown as Record<string, unknown>)).not.toThrow();
    });

    it('rejects payload missing session_id', () => {
      const { session_id, ...rest } = validPayload;
      expect(() => validateVideoFrame(rest as unknown as Record<string, unknown>)).toThrow('session_id');
    });

    it('rejects payload missing presenter_id', () => {
      const { presenter_id, ...rest } = validPayload;
      expect(() => validateVideoFrame(rest as unknown as Record<string, unknown>)).toThrow('presenter_id');
    });

    it('rejects payload missing width', () => {
      const { width, ...rest } = validPayload;
      expect(() => validateVideoFrame(rest as unknown as Record<string, unknown>)).toThrow('width');
    });

    it('rejects payload missing height', () => {
      const { height, ...rest } = validPayload;
      expect(() => validateVideoFrame(rest as unknown as Record<string, unknown>)).toThrow('height');
    });

    it('rejects non-string presenter_id', () => {
      expect(() =>
        validateVideoFrame({ ...validPayload, presenter_id: 42 } as unknown as Record<string, unknown>),
      ).toThrow('presenter_id must be a string');
    });
  });

  // ---------------------------------------------------------------------------
  // ParticipantEvent
  // ---------------------------------------------------------------------------
  describe('validateParticipantEvent', () => {
    const validJoined: ParticipantEvent = {
      session_id: 'test-room',
      participant_id: 'user-123',
      event: 'joined',
      timestamp_ms: Date.now(),
    };

    const validLeft: ParticipantEvent = {
      session_id: 'test-room',
      participant_id: 'user-123',
      event: 'left',
      timestamp_ms: Date.now(),
    };

    it('accepts a valid "joined" payload', () => {
      expect(() => validateParticipantEvent(validJoined as unknown as Record<string, unknown>)).not.toThrow();
    });

    it('accepts a valid "left" payload', () => {
      expect(() => validateParticipantEvent(validLeft as unknown as Record<string, unknown>)).not.toThrow();
    });

    it('rejects payload missing event', () => {
      const { event, ...rest } = validJoined;
      expect(() => validateParticipantEvent(rest as unknown as Record<string, unknown>)).toThrow('event');
    });

    it('rejects invalid event value', () => {
      expect(() =>
        validateParticipantEvent({ ...validJoined, event: 'reconnected' } as unknown as Record<string, unknown>),
      ).toThrow('must be "joined" or "left"');
    });

    it('rejects payload missing participant_id', () => {
      const { participant_id, ...rest } = validJoined;
      expect(() => validateParticipantEvent(rest as unknown as Record<string, unknown>)).toThrow('participant_id');
    });

    it('rejects non-number timestamp_ms', () => {
      expect(() =>
        validateParticipantEvent({ ...validJoined, timestamp_ms: 'now' } as unknown as Record<string, unknown>),
      ).toThrow('timestamp_ms must be a number');
    });
  });

  // ---------------------------------------------------------------------------
  // Topic builders
  // ---------------------------------------------------------------------------
  describe('Topics', () => {
    it('builds audio.chunk topic correctly', () => {
      expect(Topics.audioChunk('room-1')).toBe('media.session.room-1.audio.chunk');
    });

    it('builds video.frame topic correctly', () => {
      expect(Topics.videoFrame('room-1')).toBe('media.session.room-1.video.frame');
    });

    it('builds participant.joined topic correctly', () => {
      expect(Topics.participantJoined('room-1')).toBe(
        'media.session.room-1.participant.joined',
      );
    });

    it('builds participant.left topic correctly', () => {
      expect(Topics.participantLeft('room-1')).toBe(
        'media.session.room-1.participant.left',
      );
    });
  });
});
