import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateHiraganaDto } from './create-hiragana.dto';

export class CreateManyHiraganaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateHiraganaDto)
  items: CreateHiraganaDto[];
}
