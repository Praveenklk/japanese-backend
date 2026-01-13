import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  ArrayNotEmpty,
  IsUrl,
  Length,
  IsInt,
} from 'class-validator';
import { Difficulty, JLPT } from '@prisma/client';

export class CreateVocabularyDto {
  // Core word data
  @IsString()
  @IsNotEmpty()

  japanese: string;

  @IsString()
  @IsNotEmpty()
  reading: string;

  @IsString()
  @IsNotEmpty()

  english: string;

  // Organization
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsOptional()
@IsString()
explanation?: string;


  @IsEnum(Difficulty)
  @IsOptional()
  difficulty?: Difficulty;

  @IsEnum(JLPT)
  @IsOptional()
  jlptLevel?: JLPT;

    @IsInt()
      @IsOptional()
  lessonNumber?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  // Usage examples
  @IsString()
  @IsNotEmpty()
  example: string;

  @IsString()
  @IsNotEmpty()
  exampleReading: string;

  @IsString()
  @IsNotEmpty()
  exampleEnglish: string;

  // Media
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsUrl()
  audioUrl?: string;

  @IsOptional()
  @IsString()
  pitchAccent?: string;
}
