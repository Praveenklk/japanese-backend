import { IsString } from 'class-validator';

export class CreateKanjiWordDto {
  @IsString()
  word: string;

  @IsString()
  reading: string;

  @IsString()
  meaning: string;
}
