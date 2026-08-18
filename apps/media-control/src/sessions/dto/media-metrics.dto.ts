import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsOptional } from "class-validator";

export class MediaMetricsDto {
  @ApiProperty({
    description: "The percentage of packets lost during transmission.",
    example: 0.5,
  })
  @IsNumber()
  @IsOptional()
  packetLoss?: number;

  @ApiProperty({
    description: "The variation in packet delay, in milliseconds.",
    example: 15,
  })
  @IsNumber()
  @IsOptional()
  jitter?: number;

  @ApiProperty({
    description: "Round-trip time for packets, in milliseconds.",
    example: 80,
  })
  @IsNumber()
  @IsOptional()
  rtt?: number;

  @ApiProperty({
    description: "The data rate of the media stream, in kbps.",
    example: 1500,
  })
  @IsNumber()
  @IsOptional()
  bitrate?: number;
}
