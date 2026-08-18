import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class JoinRoomDto {
  @ApiProperty({
    description: 'The authentication token (JWT) authorizing the participant to join.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'The name of the room (session) to join.',
    example: 'project-kickoff-meeting',
  })
  @IsString()
  @IsNotEmpty()
  roomName: string;

  @ApiProperty({
    description: 'A unique identifier for the participant joining the room.',
    example: 'participant-user-456',
  })
  @IsString()
  @IsNotEmpty()
  participantIdentity: string;
}