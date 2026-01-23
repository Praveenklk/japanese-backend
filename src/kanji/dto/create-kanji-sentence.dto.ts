import { IsString } from 'class-validator';

export class CreateKanjiSentenceDto {
  @IsString()
  sentence: string;

  @IsString()
  reading: string;

  @IsString()
  meaning: string;
}
