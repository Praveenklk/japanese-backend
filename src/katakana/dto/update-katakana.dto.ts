import { PartialType } from '@nestjs/mapped-types';
import { CreateKatakanaDto } from './create-katakana.dto';

export class UpdateKatakanaDto extends PartialType(CreateKatakanaDto) {}
