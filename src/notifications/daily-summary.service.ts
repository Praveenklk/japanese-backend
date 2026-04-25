// src/notifications/japanese-daily.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramService } from './telegram.service';
import fullVocabulary from '../json/Vocabulary/fullvocabulary.json';

type VocabItem = {
  word: string;
  kana?: string;
  romaji?: string;
  meaning: string;
  jlpt?: number;
  card: 'word';
};

type KanjiItem = {
  kanji: string;
  meaning?: string;
  keyword?: string;
  on?: string;
  kun?: string;
  jlpt?: number;
  image?: string;
  redirect_to?: string;
  card: 'kanji';
};

@Injectable()
export class JapaneseDailyService {
  private readonly logger = new Logger(JapaneseDailyService.name);

  private vocabN5: VocabItem[] = [];
  private vocabN4: VocabItem[] = [];
  private kanjiN5: KanjiItem[] = [];
  private kanjiN4: KanjiItem[] = [];

  constructor(private readonly telegram: TelegramService) {
    const allItems = Object.values(fullVocabulary as Record<string, any>);

    const vocabList = allItems.filter((i: any) => i.card === 'word');
    const kanjiList = allItems.filter((i: any) => i.card === 'kanji');

    this.vocabN5 = vocabList.filter((v: any) => v.jlpt === 5);
    this.vocabN4 = vocabList.filter((v: any) => v.jlpt === 4);

    this.kanjiN5 = kanjiList.filter((k: any) => k.jlpt === 5);
    this.kanjiN4 = kanjiList.filter((k: any) => k.jlpt === 4);

    this.logger.log(
      `Loaded N5 vocab: ${this.vocabN5.length}, N4 vocab: ${this.vocabN4.length}, N5 kanji: ${this.kanjiN5.length}, N4 kanji: ${this.kanjiN4.length}`,
    );
  }

  // 🧪 Testing: every minute → change later
  // @Cron('* * * * *')
  async sendDailyJapanese() {
    const dailyVocabN5 = this.pickRandom(this.vocabN5, 20);
    const dailyVocabN4 = this.pickRandom(this.vocabN4, 20);
    const dailyKanjiN5 = this.pickRandom(this.kanjiN5, 5);
    const dailyKanjiN4 = this.pickRandom(this.kanjiN4, 5);

    const vocabN5Text = dailyVocabN5
      .map(
        (v, i) =>
          `${i + 1}. ${v.word}${v.kana ? `（${v.kana}）` : ''} – ${v.meaning}`,
      )
      .join('\n');

    const vocabN4Text = dailyVocabN4
      .map(
        (v, i) =>
          `${i + 1}. ${v.word}${v.kana ? `（${v.kana}）` : ''} – ${v.meaning}`,
      )
      .join('\n');

    const headerMessage = `
🌅 <b>Daily Japanese Study</b>

📖 <b>N5 Vocabulary (20)</b>
${vocabN5Text}

📖 <b>N4 Vocabulary (20)</b>
${vocabN4Text}

🈶 <b>N5 + N4 Kanji (10)</b>
`.trim();

    try {
      // 1️⃣ Send text first
      await this.telegram.send(headerMessage);

      // 2️⃣ Send kanji images
      for (const k of [...dailyKanjiN5, ...dailyKanjiN4]) {
        if (!k.image) continue;

        // ⚠️ Adjust this URL if your image path is different
        const imageUrl = `https://hochanh.github.io/rtk/assets/kanji/${k.image}.png`;

        const caption = `
<b>${k.kanji}</b> – ${k.meaning || k.keyword || '—'}
${k.on ? `On: ${k.on}` : ''}
${k.kun ? `Kun: ${k.kun}` : ''}
${k.redirect_to ? `🔗 <a href="${k.redirect_to}">More details</a>` : ''}
`.trim();

        await this.telegram.sendPhoto(imageUrl, caption);
      }

      this.logger.log('Daily Japanese study + kanji images sent to Telegram');
    } catch (err) {
      this.logger.error('Failed to send daily Japanese message/images', err);
    }
  }

  private pickRandom<T>(arr: T[], n: number): T[] {
    return [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
  }
}
