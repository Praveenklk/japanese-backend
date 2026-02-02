import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HiraganaModule } from './hiragana/hiragana.module';
import { AuthModule } from './auth/auth.module';
import { KatakanaModule } from './katakana/katakana.module';
import { VocabularyModule } from './vocabulary/vocabulary.module';
import { StoryModule } from './story/story.module';
import { AnkiModule } from './anki/anki.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,   // 👈 makes env available everywhere
    }),
    PrismaModule,
    AuthModule,
     HiraganaModule,
     KatakanaModule,
     VocabularyModule,
     StoryModule,
     AnkiModule,
     HealthModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
