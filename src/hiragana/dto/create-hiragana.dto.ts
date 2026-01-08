import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateHiraganaDto {
  @IsString()
  @IsNotEmpty()
  symbol: string; // あ

  @IsString()
  @IsNotEmpty()
  romaji: string; // a

  @IsString()
  @IsNotEmpty()
  explanation: string;

  @IsString()
  @IsOptional()
  example?: string;

  // base64 string from frontend (optional now)
  @IsString()
  @IsOptional()
  imageBase64?: string;

  @IsString()
  @IsOptional()
  audioUrl?: string;
}
