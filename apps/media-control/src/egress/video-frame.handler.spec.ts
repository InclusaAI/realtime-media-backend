import { VideoFrameHandler } from './video-frame.handler';

describe('VideoFrameHandler', () => {
  let handler: VideoFrameHandler;
  let kafkaEmit: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    kafkaEmit = jest.fn();
    handler = new VideoFrameHandler({
      emit: kafkaEmit,
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Build a mock LiveKit Egress binary frame:
   * 4-byte big-endian payload length + payload bytes.
   */
  function buildEgressFrame(payload: Buffer): Buffer {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    return Buffer.concat([header, payload]);
  }

  describe('processVideoFrame', () => {
    it('publishes a VideoFrameEvent to the correct topic', () => {
      const frame = buildEgressFrame(Buffer.from('fake-h264-data'));

      handler.setTrackParticipant('TR_VID', 'presenter-1');
      handler.processVideoFrame('test-room', 'TR_VID', frame);

      expect(kafkaEmit).toHaveBeenCalledTimes(1);
      const [topic] = kafkaEmit.mock.calls[0];
      expect(topic).toBe('media.session.test-room.video.frame');
    });

    it('publishes snake_case fields matching VideoFrame contract', () => {
      const frame = buildEgressFrame(Buffer.from('video-data'));

      handler.setTrackParticipant('TR_VID', 'presenter-42');
      handler.processVideoFrame('my-room', 'TR_VID', frame);

      const message = kafkaEmit.mock.calls[0][1];

      // Contract-required fields
      expect(message).toHaveProperty('session_id', 'my-room');
      expect(message).toHaveProperty('presenter_id', 'presenter-42');
      expect(message).toHaveProperty('sequence', 1);
      expect(message).toHaveProperty('timestamp_ms');
      expect(typeof message.timestamp_ms).toBe('number');
      expect(message).toHaveProperty('width', 0);
      expect(message).toHaveProperty('height', 0);
      expect(message).toHaveProperty('fps', 15);
      expect(message).toHaveProperty('payload_b64');

      // Should NOT contain old camelCase fields
      expect(message).not.toHaveProperty('speakerId');
      expect(message).not.toHaveProperty('roomName');
      expect(message).not.toHaveProperty('timestamp');
      expect(message).not.toHaveProperty('frameData');
      expect(message).not.toHaveProperty('codec');
      expect(message).not.toHaveProperty('frameNumber');
      expect(message).not.toHaveProperty('trackSid');
    });

    it('base64-encodes the video payload', () => {
      const videoPayload = Buffer.from('raw-h264-frame');
      const frame = buildEgressFrame(videoPayload);

      handler.setTrackParticipant('TR_VID', 'presenter-1');
      handler.processVideoFrame('room-1', 'TR_VID', frame);

      const message = kafkaEmit.mock.calls[0][1];
      const decoded = Buffer.from(message.payload_b64, 'base64');
      expect(decoded.toString()).toBe('raw-h264-frame');
    });

    it('increments sequence per track', () => {
      const frame = buildEgressFrame(Buffer.from('frame'));

      handler.setTrackParticipant('TR_1', 'presenter-1');

      // Advance time enough between frames to pass FPS sampling
      handler.processVideoFrame('room-1', 'TR_1', frame);
      jest.advanceTimersByTime(100); // > 66.67ms
      handler.processVideoFrame('room-1', 'TR_1', frame);
      jest.advanceTimersByTime(100);
      handler.processVideoFrame('room-1', 'TR_1', frame);

      expect(kafkaEmit.mock.calls[0][1].sequence).toBe(1);
      expect(kafkaEmit.mock.calls[1][1].sequence).toBe(2);
      expect(kafkaEmit.mock.calls[2][1].sequence).toBe(3);
    });

    it('drops frames that arrive too fast (FPS sampling)', () => {
      const frame = buildEgressFrame(Buffer.from('frame'));

      handler.setTrackParticipant('TR_1', 'presenter-1');

      handler.processVideoFrame('room-1', 'TR_1', frame);
      // Second frame immediately — should be dropped
      handler.processVideoFrame('room-1', 'TR_1', frame);

      expect(kafkaEmit).toHaveBeenCalledTimes(1);
    });

    it('uses "unknown" when track has no participant mapping', () => {
      const frame = buildEgressFrame(Buffer.from('data'));
      handler.processVideoFrame('room-1', 'TR_NOBODY', frame);

      const message = kafkaEmit.mock.calls[0][1];
      expect(message.presenter_id).toBe('unknown');
    });

    it('rejects frames smaller than 4 bytes', () => {
      const tinyFrame = Buffer.from([0x00, 0x01]);
      handler.processVideoFrame('room-1', 'TR_1', tinyFrame);
      expect(kafkaEmit).not.toHaveBeenCalled();
    });

    it('rejects frames with payload size mismatch', () => {
      const header = Buffer.alloc(4);
      header.writeUInt32BE(200, 0);
      const shortPayload = Buffer.from('tiny');
      const badFrame = Buffer.concat([header, shortPayload]);

      handler.processVideoFrame('room-1', 'TR_1', badFrame);
      expect(kafkaEmit).not.toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('tracks frames received, published, and dropped', () => {
      const frame = buildEgressFrame(Buffer.from('frame'));

      handler.setTrackParticipant('TR_1', 'presenter-1');
      handler.processVideoFrame('room-1', 'TR_1', frame); // published
      handler.processVideoFrame('room-1', 'TR_1', frame); // dropped (too fast)

      const metrics = handler.getMetrics('room-1');
      expect(metrics.framesReceived).toBe(2);
      expect(metrics.framesPublished).toBe(1);
      expect(metrics.framesDropped).toBe(1);
    });

    it('reports target fps of 15', () => {
      const metrics = handler.getMetrics('room-1');
      expect(metrics.targetFps).toBe(15);
    });
  });

  describe('cleanupRoom', () => {
    it('clears metrics and timing data for the room', () => {
      const frame = buildEgressFrame(Buffer.from('frame'));
      handler.setTrackParticipant('TR_1', 'presenter-1');
      handler.processVideoFrame('room-1', 'TR_1', frame);

      expect(handler.getMetrics('room-1').framesReceived).toBe(1);

      handler.cleanupRoom('room-1');

      // Should get fresh metrics
      expect(handler.getMetrics('room-1').framesReceived).toBe(0);
    });
  });
});
