// src/notifications/telegram.controller.ts
import { Controller, Get } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { JapaneseDailyService } from './japanese-daily.service';

@Controller('notifications/telegram')
export class TelegramController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly japaneseDaily: JapaneseDailyService,
  ) {}

  @Get('japanese/test')
  testJapaneseNow() {
    return this.japaneseDaily.sendDailyJapanese();
  }
}
