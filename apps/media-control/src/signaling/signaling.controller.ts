import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Signaling')
@Controller('api/signaling')
export class SignalingController {
  @Get('events')
  @ApiOperation({ summary: 'Get WebSocket event documentation' })
  @ApiResponse({ status: 200, description: 'Returns a schema of all WebSocket events.' })
  getWebSocketEvents() {
    return {
      description: 'WebSocket signaling events for room management and WebRTC relay.',
      reconnection: {
        gracePeriod: '30 seconds (configurable per session)',
        behavior:
          'When a client disconnects, they have 30s to reconnect. ' +
          'During this period, their state is preserved. ' +
          'After 30s, they are permanently removed from the session.',
      },
      'client-to-server': {
        'join-room': {
          description:
            'Authenticates and joins a participant to a room. Must be the first event sent by a client. ' +
            'Supports both fresh joins and reconnections within the grace period.',
          payload: {
            token: 'string (JWT)',
            roomName: 'string',
            participantIdentity: 'string',
          },
          responses: {
            token: 'LiveKit SFU connection token',
            'participant-joined': 'Broadcast to room (fresh join)',
            'participant-reconnected': 'Broadcast to room (reconnection)',
          },
        },
        'leave-room': {
          description:
            'Removes a participant from a room. This is an explicit leave - no grace period.',
          payload: {
            roomName: 'string',
            participantIdentity: 'string',
          },
        },
        'quality-report': {
          description:
            'Periodic connection quality report from client. Clients should send this every 5 seconds. ' +
            'If quality degrades (RTT > 300ms or packet loss > 10%), the server sends a quality-adapt event.',
          payload: {
            rtt: 'number - round-trip time in ms',
            packetLoss: 'number - percentage (0-100)',
            jitter: 'number - in ms',
            bitrate: 'number - current bitrate in kbps',
          },
          example: {
            rtt: 45,
            packetLoss: 0.5,
            jitter: 3.2,
            bitrate: 1200,
          },
        },
        'offer': {
          description: 'Forwards a WebRTC session description offer to a specific participant.',
          payload: {
            to: 'string (client ID)',
            offer: 'object (RTCSessionDescriptionInit)',
          },
        },
        'answer': {
          description: 'Forwards a WebRTC session description answer to a specific participant.',
          payload: {
            to: 'string (client ID)',
            answer: 'object (RTCSessionDescriptionInit)',
          },
        },
        'ice-candidate': {
          description: 'Forwards a WebRTC ICE candidate to a specific participant.',
          payload: {
            to: 'string (client ID)',
            candidate: 'object (RTCIceCandidateInit)',
          },
        },
      },
      'server-to-client': {
        'token': {
          description: 'Provides the client with a token required to connect to the SFU (LiveKit).',
          payload: {
            token: 'string',
          },
        },
        'participant-joined': {
          description: 'Broadcast to all participants in a room when a new participant joins.',
          payload: {
            participantIdentity: 'string',
            joinedAt: 'string - ISO 8601',
          },
        },
        'participant-disconnected': {
          description:
            'Broadcast when a participant disconnects (network issue). ' +
            'Includes grace period so other clients know they may reconnect.',
          payload: {
            participantIdentity: 'string',
            disconnectedAt: 'string - ISO 8601',
            gracePeriodMs: 'number - 30000 (30 seconds)',
          },
        },
        'participant-reconnected': {
          description: 'Broadcast when a disconnected participant reconnects within the grace period.',
          payload: {
            participantIdentity: 'string',
            reconnectedAt: 'string - ISO 8601',
          },
        },
        'participant-left': {
          description:
            'Broadcast when a participant explicitly leaves or their grace period expires.',
          payload: {
            participantIdentity: 'string',
            leftAt: 'string - ISO 8601',
          },
        },
        'quality-adapt': {
          description:
            'Sent to a specific client when their connection quality degrades. ' +
            'Instructs the client to reduce video/audio quality.',
          payload: {
            reason: 'string - high_packet_loss or high_rtt',
            suggestedQuality: 'string - low, medium, high',
            timestamp: 'string - ISO 8601',
          },
        },
        'offer': {
          description: 'Relays an offer from another client.',
          payload: {
            from: 'string (client ID)',
            offer: 'object (RTCSessionDescriptionInit)',
          },
        },
        'answer': {
          description: 'Relays an answer from another client.',
          payload: {
            from: 'string (client ID)',
            answer: 'object (RTCSessionDescriptionInit)',
          },
        },
        'ice-candidate': {
          description: 'Relays an ICE candidate from another client.',
          payload: {
            from: 'string (client ID)',
            candidate: 'object (RTCIceCandidateInit)',
          },
        },
      },
    };
  }
}