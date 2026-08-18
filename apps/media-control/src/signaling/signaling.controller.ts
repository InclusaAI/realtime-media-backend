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
      'client-to-server': {
        'join-room': {
          description: 'Authenticates and joins a participant to a room. Must be the first event sent by a client.',
          payload: {
            token: 'string (JWT)',
            roomName: 'string',
            participantIdentity: 'string',
          },
        },
        'leave-room': {
          description: 'Removes a participant from a room.',
          payload: {
            roomName: 'string',
            participantIdentity: 'string',
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
          },
        },
        'participant-left': {
          description: 'Broadcast to all participants in a room when a participant leaves.',
          payload: {
            participantIdentity: 'string',
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