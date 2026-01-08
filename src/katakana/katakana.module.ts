import { Module } from '@nestjs/common';
import { KatakanaService } from './katakana.service';
import { KatakanaController } from './katakana.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [KatakanaController],
  providers: [KatakanaService, PrismaService],
})
export class KatakanaModule {}
