import { Module } from '@nestjs/common';
import { HiraganaService } from './hiragana.service';
import { HiraganaController } from './hiragana.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  controllers: [HiraganaController],
  providers: [HiraganaService],
})
export class HiraganaModule {}
