import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDate, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MediaMetricsDto } from './media-metrics.dto';

// A simple placeholder for a participant - this could be expanded later
class ParticipantDto {
  @ApiProperty({ example: 'participant-user-123' })
  @IsString()
  identity: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  name: string;
}

export class SessionStatusDto {
  @ApiProperty({
    description: 'The unique identifier for the session.',
    example: 'project-kickoff-meeting',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'The current state of the session (e.g., active, ended).',
    example: 'active',
  })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({
    description: 'The timestamp when the session was created.',
  })
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    description: 'A list of participants currently in the session.',
    type: [ParticipantDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  participants: ParticipantDto[];

  @ApiProperty({
    description: 'Aggregated connection quality metrics for the session.',
  })
  @ValidateNested()
  @Type(() => MediaMetricsDto)
  metrics: MediaMetricsDto;
}