import { Module } from '@nestjs/common';
import { AnkiController } from './anki.controller';
import { AnkiService } from './anki.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';


@Module({
  controllers: [AnkiController],
  providers: [AnkiService, PrismaService, CloudinaryService],
})
export class AnkiModule {}
