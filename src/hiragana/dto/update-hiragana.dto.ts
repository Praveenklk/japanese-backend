import { IsOptional, IsString } from 'class-validator';

export class UpdateHiraganaDto {
  @IsString()
  @IsOptional()
  symbol?: string;

  @IsString()
  @IsOptional()
  romaji?: string;

  @IsString()
  @IsOptional()
  explanation?: string;

  @IsString()
  @IsOptional()
  example?: string;

  @IsString()
  @IsOptional()
  imageBase64?: string;

  @IsString()
  @IsOptional()
  audioUrl?: string;
}
