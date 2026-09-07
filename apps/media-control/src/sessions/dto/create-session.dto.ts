import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

/**
 * Communication mode — matches platform-backend Prisma enum CommunicationMode.
 */
export enum SessionMode {
  SPEECH = 'SPEECH',
  SIGN_LANGUAGE = 'SIGN_LANGUAGE',
  HYBRID = 'HYBRID',
}

export class CreateSessionDto {
  @ApiProperty({
    description: 'Optional friendly name or identifier for the session. If not provided, a unique ID will be generated.',
    example: 'project-kickoff-meeting',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiProperty({
    description: 'The unique identifier for the user or entity initiating the session.',
    example: 'user-initiator-123',
  })
  @IsString()
  @IsNotEmpty()
  initiatorId: string;

  @ApiProperty({
    description: 'The mode of the session, determining its behavior and features.',
    enum: SessionMode,
    example: SessionMode.HYBRID,
  })
  @IsEnum(SessionMode)
  @IsNotEmpty()
  mode: SessionMode;
}