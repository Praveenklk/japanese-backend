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
  jlpt: number;
  card: 'word';
};

type KanjiItem = {
  kanji: string;
  keyword?: string;
  'on-yomi'?: string;
  'kun-yomi'?: string;
  jlpt: number;
  redirect_to?: string;
  card: 'kanji';
};

@Injectable()
export class JapaneseDailyService {
  private readonly logger = new Logger(JapaneseDailyService.name);

  private vocabList: VocabItem[] = [];
  private kanjiList: KanjiItem[] = [];

  constructor(private readonly telegram: TelegramService) {
    const allItems = Object.values(fullVocabulary as Record<string, any>);

    this.vocabList = allItems.filter(
      (i: any) =>
        i?.card === 'word' &&
        typeof i?.word === 'string' &&
        typeof i?.meaning === 'string',
    ) as VocabItem[];

    // ✅ Only N5 & N4 Kanji
    this.kanjiList = allItems.filter(
      (i: any) =>
        i?.card === 'kanji' &&
        typeof i?.kanji === 'string' &&
        (i?.jlpt === 5 || i?.jlpt === 4),
    ) as KanjiItem[];

    this.logger.log(
      `📚 Loaded ${this.vocabList.length} vocab & ${this.kanjiList.length} kanji (N5/N4 only)`,
    );
  }

  // 🕗 Daily at 8 AM IST
  @Cron('0 7 * * *', { timeZone: 'Asia/Kolkata' })
  async sendDailyJapanese() {
    this.logger.log('⏰ Daily Japanese Cron triggered');

    if (!this.vocabList.length || !this.kanjiList.length) {
      this.logger.warn('⚠️ No vocab/kanji found in JSON');
      return;
    }

    const dailyVocab = this.pickRandom(this.vocabList, 15);
    const dailyKanji = this.pickRandom(this.kanjiList, 5);

    const vocabText = dailyVocab
      .map(
        (v, i) =>
          `🔹 <b>${i + 1}.</b> ${v.word}${v.kana ? `（${v.kana}）` : ''}\n    ➤ <i>${v.meaning}</i>  <b>N${v.jlpt}</b>`,
      )
      .join('\n\n');

    const kanjiText = dailyKanji
      .map((k, i) => {
        const meaning = k.keyword || '—';
        const on = k['on-yomi'] || '—';
        const kun = k['kun-yomi'] || '—';

        return `🈶 <b>${i + 1}.</b> ${k.kanji} — <i>${meaning}</i>\n    🔊 On: ${on} | Kun: ${kun}  <b>N${k.jlpt}</b>`;
      })
      .join('\n\n');

    const header = `
🌅 <b>Daily Japanese Boost</b>
━━━━━━━━━━━━━━━━━━━━━━

📖 <b>Vocabulary (15)</b>
${vocabText}

━━━━━━━━━━━━━━━━━━━━━━
🈶 <b>Kanji (N5 & N4 Only)</b>
${kanjiText}

✨ <i>Small steps every day = Big progress 🇯🇵🔥</i>
👇 <i>Tap the links below to see animated kanji pages</i>
`.trim();

    try {
      // 1️⃣ Main message
      await this.telegram.send(header);

      // 2️⃣ Individual kanji links (nice & clickable)
      for (const k of dailyKanji) {
        if (!k.redirect_to) continue;

        const linkMsg = `
🈶 <b>${k.kanji}</b> — ${k.keyword || '—'}
🔤 <b>On:</b> ${k['on-yomi'] || '—'} | <b>Kun:</b> ${k['kun-yomi'] || '—'}
🎯 <b>Level:</b> JLPT N${k.jlpt}
🔗 <a href="${k.redirect_to}">Open animated kanji page</a>
`.trim();

        await this.telegram.send(linkMsg);
      }

      this.logger.log('✅ Daily Japanese message sent successfully');
    } catch (err) {
      this.logger.error('❌ Failed to send daily Japanese message', err);
    }
  }

  private pickRandom<T>(arr: T[], n: number): T[] {
    return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
  }
}
