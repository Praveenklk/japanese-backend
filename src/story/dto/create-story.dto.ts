import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  IsArray,
  IsBoolean,
  IsJSON,
} from 'class-validator';
import { Difficulty, JLPT, StoryStatus } from '@prisma/client';

export class CreateStoryDto {
  // 📘 Story identity
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  japaneseTitle: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  // 🎓 Learning metadata
  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @IsEnum(JLPT)
  @IsOptional()
  level?: JLPT;

  @IsString()
  @IsNotEmpty()
  duration: string;

  @IsInt()
  @Min(1)
  wordCount: number;

  // 🏷️ Discovery
  @IsArray()
  @IsString({ each: true })
  tags: string[];

  // 📚 Main content
  @IsNotEmpty()
  content: any;

  @IsNotEmpty()
  comprehensionQuiz: any;

  // ⭐ User interaction
  @IsOptional()
  @IsBoolean()
  isBookmarked?: boolean;

  // 🔐 Availability
  @IsOptional()
  @IsEnum(StoryStatus)
  status?: StoryStatus;
}
