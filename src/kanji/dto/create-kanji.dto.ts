import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { JLPT, KanjiStatus } from '@prisma/client';
import { CreateKanjiWordDto } from './create-kanji-word.dto';
import { CreateKanjiSentenceDto } from './create-kanji-sentence.dto';

export class CreateKanjiDto {
  @IsString()
  character: string;

  @IsString()
  meaning: string;

  @IsArray()
  @IsString({ each: true })
  onyomi: string[];

  @IsArray()
  @IsString({ each: true })
  kunyomi: string[];

  @IsInt()
  strokes: number;

  @IsArray()
  @IsString({ each: true })
  radicals: string[];

  @IsEnum(JLPT)
  jlptLevel: JLPT;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsString()
  memoryStory?: string;

  @IsOptional()
  @IsString()
  aiHint?: string;

  @IsOptional()
  @IsEnum(KanjiStatus)
  status?: KanjiStatus;

  @IsOptional()
  words?: CreateKanjiWordDto[];

  @IsOptional()
  sentences?: CreateKanjiSentenceDto[];
}
