import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateKatakanaDto } from './create-katakana.dto';

export class CreateManyKatakanaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateKatakanaDto)
  data: CreateKatakanaDto[];
}
