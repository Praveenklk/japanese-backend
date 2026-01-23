import { Module } from '@nestjs/common';
import { AnkiController } from './anki.controller';
import { AnkiService } from './anki.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AnkiController],
  providers: [AnkiService, PrismaService],
})
export class AnkiModule {}
