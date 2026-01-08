import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateKatakanaDto {
  @IsString()
  symbol: string;

  @IsString()
  romaji: string;

  @IsString()
  explanation: string;

  @IsOptional()
  @IsString()
  example?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}
