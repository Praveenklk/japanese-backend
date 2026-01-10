import { IsBoolean } from 'class-validator';

export class UpdateReadStatusDto {
  @IsBoolean()
  isRead: boolean;
}
