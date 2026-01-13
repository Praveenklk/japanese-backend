import { PartialType } from '@nestjs/mapped-types';
import { CreateVocabularyDto } from './create-vocabulary.dto';
import {
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';

export class UpdateVocabularyDto extends PartialType(CreateVocabularyDto) {
  // Learning state
  @IsOptional()
  @IsBoolean()
  isLearned?: boolean;

  @IsOptional()
  @IsBoolean()
  isBookmarked?: boolean;

  // Review stats (admin-only usually)
  @IsOptional()
  @IsInt()
  @Min(0)
  reviews?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  correctCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  incorrectCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  streak?: number;

  // Spaced repetition (careful editing)
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number;

  @IsOptional()
  @IsDateString()
  nextReviewAt?: string;
}
