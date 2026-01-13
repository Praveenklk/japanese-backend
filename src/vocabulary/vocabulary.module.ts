import { Module } from '@nestjs/common';
import { VocabularyService } from './vocabulary.service';
import { VocabularyController } from './vocabulary.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [VocabularyController],
  providers: [VocabularyService, PrismaService],
})
export class VocabularyModule {}
