// src/notifications/notifications.module.ts
import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
// import { DailySummaryService } from './daily-summary.service';
import { JapaneseDailyService } from './japanese-daily.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    TelegramService,
    JapaneseDailyService, // ✅ add this
  ],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class NotificationsModule {}
