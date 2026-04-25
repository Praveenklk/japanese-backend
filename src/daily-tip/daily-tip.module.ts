import { Module } from '@nestjs/common';
import { DailyLearningController } from './daily-tip.controller';
import { DailyLearningService } from './daily-tip.service';

@Module({
  controllers: [DailyLearningController],
  providers: [DailyLearningService],
})
export class DailyTipModule {}


