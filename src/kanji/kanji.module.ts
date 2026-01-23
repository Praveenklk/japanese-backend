import { Module } from '@nestjs/common';
import { KanjiService } from './kanji.service';
import { KanjiController } from './kanji.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [KanjiController],
  providers: [KanjiService, PrismaService],
})
export class KanjiModule {}
