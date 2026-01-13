import { Type } from 'class-transformer';
import { ValidateNested, IsArray, ArrayNotEmpty } from 'class-validator';
import { CreateVocabularyDto } from './create-vocabulary.dto';

export class BulkCreateVocabularyDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateVocabularyDto)
  items: CreateVocabularyDto[];
}
