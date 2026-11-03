import { AudioChunkHandler } from './audio-chunk.handler';

describe('AudioChunkHandler', () => {
  let handler: AudioChunkHandler;
  let kafkaEmit: jest.Mock;

  beforeEach(() => {
    kafkaEmit = jest.fn();
    handler = new AudioChunkHandler({
      emit: kafkaEmit,
    } as any);
  });

  describe('processAudioFrame', () => {
    /**
     * Build a mock LiveKit Egress binary frame:
     * 4-byte big-endian payload length + payload bytes.
     */
    function buildEgressFrame(payload: Buffer): Buffer {
      const header = Buffer.alloc(4);
      header.writeUInt32BE(payload.length, 0);
      return Buffer.concat([header, payload]);
    }

    it('publishes an AudioChunkEvent to the correct topic', () => {
      const audioPayload = Buffer.from('fake-opus-data');
      const frame = buildEgressFrame(audioPayload);

      handler.setTrackParticipant('TR_ABC', 'user-1');
      handler.processAudioFrame('test-room', 'TR_ABC', frame);

      expect(kafkaEmit).toHaveBeenCalledTimes(1);
      const [topic, message] = kafkaEmit.mock.calls[0];
      expect(topic).toBe('media.session.test-room.audio.chunk');
    });

    it('publishes snake_case fields matching AudioChunk contract', () => {
      const audioPayload = Buffer.from('test-audio');
      const frame = buildEgressFrame(audioPayload);

      handler.setTrackParticipant('TR_ABC', 'speaker-42');
      handler.processAudioFrame('my-room', 'TR_ABC', frame);

      const message = kafkaEmit.mock.calls[0][1];

      // Contract-required fields
      expect(message).toHaveProperty('session_id', 'my-room');
      expect(message).toHaveProperty('speaker_id', 'speaker-42');
      expect(message).toHaveProperty('sequence', 1);
      expect(message).toHaveProperty('timestamp_ms');
      expect(typeof message.timestamp_ms).toBe('number');
      expect(message).toHaveProperty('sample_rate', 16000);
      expect(message).toHaveProperty('encoding', 'opus');
      expect(message).toHaveProperty('payload_b64');

      // Should NOT contain old camelCase fields
      expect(message).not.toHaveProperty('speakerId');
      expect(message).not.toHaveProperty('roomName');
      expect(message).not.toHaveProperty('timestamp');
      expect(message).not.toHaveProperty('audioData');
      expect(message).not.toHaveProperty('channels');
      expect(message).not.toHaveProperty('trackSid');
    });

    it('base64-encodes the audio payload', () => {
      const audioPayload = Buffer.from('hello-audio');
      const frame = buildEgressFrame(audioPayload);

      handler.setTrackParticipant('TR_ABC', 'user-1');
      handler.processAudioFrame('room-1', 'TR_ABC', frame);

      const message = kafkaEmit.mock.calls[0][1];
      const decoded = Buffer.from(message.payload_b64, 'base64');
      expect(decoded.toString()).toBe('hello-audio');
    });

    it('increments sequence per track', () => {
      const frame = buildEgressFrame(Buffer.from('chunk1'));
      handler.setTrackParticipant('TR_1', 'user-1');

      handler.processAudioFrame('room-1', 'TR_1', frame);
      handler.processAudioFrame('room-1', 'TR_1', frame);
      handler.processAudioFrame('room-1', 'TR_1', frame);

      expect(kafkaEmit.mock.calls[0][1].sequence).toBe(1);
      expect(kafkaEmit.mock.calls[1][1].sequence).toBe(2);
      expect(kafkaEmit.mock.calls[2][1].sequence).toBe(3);
    });

    it('uses "unknown" when track has no participant mapping', () => {
      const frame = buildEgressFrame(Buffer.from('data'));
      handler.processAudioFrame('room-1', 'TR_NOBODY', frame);

      const message = kafkaEmit.mock.calls[0][1];
      expect(message.speaker_id).toBe('unknown');
    });

    it('rejects frames smaller than 4 bytes', () => {
      const tinyFrame = Buffer.from([0x00, 0x01]);
      handler.processAudioFrame('room-1', 'TR_1', tinyFrame);
      expect(kafkaEmit).not.toHaveBeenCalled();
    });

    it('rejects frames with payload size mismatch', () => {
      // Header says 100 bytes but only 5 follow
      const header = Buffer.alloc(4);
      header.writeUInt32BE(100, 0);
      const shortPayload = Buffer.from('hello');
      const badFrame = Buffer.concat([header, shortPayload]);

      handler.processAudioFrame('room-1', 'TR_1', badFrame);
      expect(kafkaEmit).not.toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('tracks chunks received and published', () => {
      const frame = buildEgressFrame(Buffer.from('data'));
      handler.setTrackParticipant('TR_1', 'user-1');

      handler.processAudioFrame('room-1', 'TR_1', frame);

      const metrics = handler.getMetrics('room-1');
      expect(metrics.chunksReceived).toBe(1);
      expect(metrics.chunksPublished).toBe(1);
      expect(metrics.publishFailures).toBe(0);
    });

    it('tracks publish failures when kafka throws', () => {
      kafkaEmit.mockImplementation(() => {
        throw new Error('kafka down');
      });

      const frame = buildEgressFrame(Buffer.from('data'));
      handler.setTrackParticipant('TR_1', 'user-1');
      handler.processAudioFrame('room-1', 'TR_1', frame);

      const metrics = handler.getMetrics('room-1');
      expect(metrics.chunksReceived).toBe(1);
      expect(metrics.publishFailures).toBe(1);
      expect(metrics.errors.length).toBe(1);
      expect(metrics.errors[0]).toContain('kafka down');
    });
  });
});

function buildEgressFrame(payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}
