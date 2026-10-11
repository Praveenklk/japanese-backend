import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class DailyLearningService {
  private readonly logger = new Logger(DailyLearningService.name);
  private readonly geminiKey = process.env.GEMINI_API_KEY;
  private readonly openRouterKey = process.env.OPENROUTER_API_KEY;

  // In-memory lock so overlapping requests share one generation attempt.
  private inFlight: Promise<any> | null = null;

  // Gemini models in priority order.
  // gemini-2.5-flash and gemini-3.5-flash have generous free tier (15 RPM / 1500 RPD)
  // and support JSON output without token truncation.
  private readonly GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
  ];

  // OpenRouter fallback models if Gemini is completely unavailable
  private readonly OPENROUTER_FALLBACK_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free',
  ];

  // Model catalog cache for OpenRouter
  private modelListCache: { models: string[]; fetchedAt: number } | null = null;
  private readonly MODEL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(private prisma: PrismaService) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getTodayInIST(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;

    if (!year || !month || !day) {
      return new Date().toISOString().slice(0, 10);
    }

    return `${year}-${month}-${day}`;
  }

  private extractJsonObject(text: string): string {
    const cleaned = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');

    if (first === -1 || last === -1 || last <= first) {
      throw new Error('No JSON object found in AI response.');
    }

    return cleaned.substring(first, last + 1);
  }

  // ---------------------------------------------------------------------
  // Primary AI Provider: Google Gemini API (Free Tier)
  // ---------------------------------------------------------------------
  private async callGeminiWithModel(prompt: string, model: string): Promise<string> {
    if (!this.geminiKey) {
      throw new Error('Missing GEMINI_API_KEY');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiKey}`;

    // thinkingBudget is omitted because some models (e.g. flash-lite) reject it with 400.
    // Setting maxOutputTokens to 8192 provides ample room for full JSON output.
    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          maxOutputTokens: 8192,
        },
      },
      { timeout: 85000 },
    );

    const candidate = response.data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text || !text.trim()) {
      throw new Error(`Gemini model ${model} returned empty response.`);
    }

    if (candidate?.finishReason === 'MAX_TOKENS') {
      this.logger.warn(`⚠️ Gemini ${model} hit MAX_TOKENS — check JSON completeness.`);
    }

    return text;
  }

  private async callGemini(prompt: string): Promise<string> {
    if (!this.geminiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment.');
    }

    let lastError: any = null;

    for (const model of this.GEMINI_MODELS) {
      try {
        this.logger.log(`🤖 Attempting Gemini model: ${model}`);
        const text = await this.callGeminiWithModel(prompt, model);
        this.logger.log(`✅ Gemini model ${model} succeeded!`);
        return text;
      } catch (err: any) {
        lastError = err;
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message ?? err.message ?? '';

        this.logger.warn(`⚠️ Gemini model ${model} failed (${status || 'error'}): ${msg}`);

        // If rate limited (429) or transient 503, brief pause before next model
        if (status === 429 || status === 503) {
          await this.sleep(2000);
        }
      }
    }

    throw lastError ?? new Error('All Gemini models failed.');
  }

  // ---------------------------------------------------------------------
  // Secondary Fallback Provider: OpenRouter API
  // ---------------------------------------------------------------------
  private async getOpenRouterModels(): Promise<string[]> {
    const now = Date.now();
    if (this.modelListCache && now - this.modelListCache.fetchedAt < this.MODEL_CACHE_TTL_MS) {
      return this.modelListCache.models;
    }

    try {
      const response = await axios.get('https://openrouter.ai/api/v1/models', { timeout: 15000 });
      const allModels: any[] = response.data?.data ?? [];

      const filtered = allModels
        .filter((m) => {
          const isFree =
            (typeof m.id === 'string' && m.id.endsWith(':free')) ||
            (m.pricing?.prompt === '0' && m.pricing?.completion === '0');
          const id = (m.id ?? '').toLowerCase();
          const isReasoning =
            id.includes('r1') ||
            id.includes('qwq') ||
            id.includes('thinking') ||
            id.includes('reasoner') ||
            id.includes('o1') ||
            id.includes('o3') ||
            id.includes('apodex');
          return isFree && !isReasoning;
        })
        .map((m) => m.id);

      const combined = Array.from(new Set([...filtered, ...this.OPENROUTER_FALLBACK_MODELS]));
      this.modelListCache = { models: combined, fetchedAt: now };
      return combined;
    } catch (e: any) {
      this.logger.warn('Failed to fetch OpenRouter catalog, using fallback list.');
      return this.OPENROUTER_FALLBACK_MODELS;
    }
  }

  private async callOpenRouter(prompt: string, model: string): Promise<string> {
    if (!this.openRouterKey) {
      throw new Error('Missing OPENROUTER_API_KEY.');
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a JSON API. Return ONLY valid JSON. Never explain. Never think aloud. Never include markdown.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 6000,
      },
      {
        headers: {
          Authorization: `Bearer ${this.openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'https://localhost',
          'X-Title': 'Daily JLPT Learning',
        },
        timeout: 60000,
      },
    );

    const choice = response.data?.choices?.[0];
    let content = choice?.message?.content;

    if (!content && choice?.message?.reasoning) {
      content = choice.message.reasoning;
    }

    if (typeof content !== 'string' || !content.trim()) {
      throw new Error(`OpenRouter model ${model} returned empty content.`);
    }

    return content.trim();
  }

  // ---------------------------------------------------------------------
  // Orchestrator: Try Gemini first, fallback to OpenRouter
  // ---------------------------------------------------------------------
  private async callAi(prompt: string): Promise<string> {
    // 1. Primary: Google Gemini Free Tier
    if (this.geminiKey) {
      try {
        return await this.callGemini(prompt);
      } catch (geminiError: any) {
        this.logger.warn(
          `⚠️ Gemini failed (${geminiError.message}), attempting OpenRouter fallback...`,
        );
      }
    }

    // 2. Secondary: OpenRouter
    if (this.openRouterKey) {
      const models = (await this.getOpenRouterModels()).slice(0, 3);
      for (const model of models) {
        try {
          this.logger.log(`🔄 Trying OpenRouter fallback model: ${model}`);
          const text = await this.callOpenRouter(prompt, model);
          this.logger.log(`✅ OpenRouter model ${model} succeeded!`);
          return text;
        } catch (orError: any) {
          this.logger.warn(`⚠️ OpenRouter model ${model} failed: ${orError.message}`);
          await this.sleep(1500);
        }
      }
    }

    throw new Error('All AI providers (Gemini & OpenRouter) failed to respond.');
  }

  // ---------------------------------------------------------------------
  // Rich Built-in Fallback Data (Guarantees Flutter Quiz NEVER breaks)
  // ---------------------------------------------------------------------
  private getBuiltInLearningData(today: string) {
    return {
      date: today,
      tip: '小さな一歩が大きな成果につながります。毎日続けよう！ (Small steps lead to big achievements. Keep going every day!)',
      vocabulary: [
        {
          word: '行く',
          reading: 'いく',
          meaning: 'to go',
          level: 'N5',
          example: 'がっこうへ いきます。',
          exampleReading: 'がっこうへ いきます。',
          exampleMeaning: 'I go to school.',
        },
        {
          word: '食べる',
          reading: 'たべる',
          meaning: 'to eat',
          level: 'N5',
          example: 'ごはんを たべます。',
          exampleReading: 'ごはんを たべます。',
          exampleMeaning: 'I eat a meal.',
        },
        {
          word: '水',
          reading: 'みず',
          meaning: 'water',
          level: 'N5',
          example: 'みずを のみます。',
          exampleReading: 'みずを のみます。',
          exampleMeaning: 'I drink water.',
        },
        {
          word: '本',
          reading: 'ほん',
          meaning: 'book',
          level: 'N5',
          example: 'ほんを よみます。',
          exampleReading: 'ほんを よみます。',
          exampleMeaning: 'I read a book.',
        },
        {
          word: '大きい',
          reading: 'おおきい',
          meaning: 'big / large',
          level: 'N5',
          example: 'おおきい いえです。',
          exampleReading: 'おおきい いえです。',
          exampleMeaning: 'It is a big house.',
        },
        {
          word: '小さい',
          reading: 'ちいさい',
          meaning: 'small / little',
          level: 'N5',
          example: 'ちいさい ねこです。',
          exampleReading: 'ちいさい ねこです。',
          exampleMeaning: 'It is a small cat.',
        },
        {
          word: '新しい',
          reading: 'あたらしい',
          meaning: 'new',
          level: 'N5',
          example: 'あたらしい くるまです。',
          exampleReading: 'あたらしい くるまです。',
          exampleMeaning: 'It is a new car.',
        },
        {
          word: '見る',
          reading: 'みる',
          meaning: 'to see / to watch',
          level: 'N5',
          example: 'えいがを みます。',
          exampleReading: 'えいがを みます。',
          exampleMeaning: 'I watch a movie.',
        },
        {
          word: '話す',
          reading: 'はなす',
          meaning: 'to speak / to talk',
          level: 'N5',
          example: 'にほんごを はなします。',
          exampleReading: 'にほんごを はなします。',
          exampleMeaning: 'I speak Japanese.',
        },
        {
          word: '友達',
          reading: 'ともだち',
          meaning: 'friend',
          level: 'N5',
          example: 'ともだちと あそびます。',
          exampleReading: 'ともだちと あそびます。',
          exampleMeaning: 'I play with a friend.',
        },
      ],
      grammar: [
        {
          title: '〜は〜です (A is B)',
          level: 'N5',
          explanation: 'Basic polite copula pattern stating that topic A is equal to B.',
          examples: [
            {
              sentence: 'これは 本です。',
              reading: 'これは ほんです。',
              meaning: 'This is a book.',
            },
            {
              sentence: 'きょうは いいてんきです。',
              reading: 'きょうは いいてんきです。',
              meaning: 'Today the weather is nice.',
            },
            {
              sentence: '田中さんは せんせいです。',
              reading: 'たなかさんは せんせいです。',
              meaning: 'Tanaka is a teacher.',
            },
          ],
        },
        {
          title: '〜を〜ます (Direct Object)',
          level: 'N5',
          explanation: 'The particle を marks the direct object that receives the action.',
          examples: [
            {
              sentence: 'おちゃを のみます。',
              reading: 'おちゃを のみます。',
              meaning: 'I drink green tea.',
            },
            {
              sentence: 'パンを たべます。',
              reading: 'パンを たべます。',
              meaning: 'I eat bread.',
            },
            {
              sentence: 'おんがくを ききます。',
              reading: 'おんがくを ききます。',
              meaning: 'I listen to music.',
            },
          ],
        },
      ],
      kanji: [
        {
          kanji: '日',
          meaning: 'day, sun',
          reading: 'にち, ひ',
          level: 'N5',
          examples: [
            { sentence: '日曜日です。', reading: 'にちようびです。', meaning: 'It is Sunday.' },
            { sentence: '日がのぼる。', reading: 'ひがのぼる。', meaning: 'The sun rises.' },
          ],
          memoryTip: 'Looks like a window showing the sun.',
        },
        {
          kanji: '月',
          meaning: 'moon, month',
          reading: 'げつ, つき',
          level: 'N5',
          examples: [
            { sentence: '月曜日です。', reading: 'げつようびです。', meaning: 'It is Monday.' },
            { sentence: '月がきれい。', reading: 'つきがきれい。', meaning: 'The moon is pretty.' },
          ],
          memoryTip: 'Resembles the crescent moon.',
        },
        {
          kanji: '火',
          meaning: 'fire',
          reading: 'か, ひ',
          level: 'N5',
          examples: [
            { sentence: '火曜日です。', reading: 'かようびです。', meaning: 'It is Tuesday.' },
            { sentence: '火をつけます。', reading: 'ひをつけます。', meaning: 'Light a fire.' },
          ],
          memoryTip: 'Flames rising up into the air.',
        },
        {
          kanji: '水',
          meaning: 'water',
          reading: 'すい, みず',
          level: 'N5',
          examples: [
            { sentence: '水曜日です。', reading: 'すいようびです。', meaning: 'It is Wednesday.' },
            { sentence: '水をのみます。', reading: 'みずをのみます。', meaning: 'Drink water.' },
          ],
          memoryTip: 'Droplets splashing in water.',
        },
        {
          kanji: '木',
          meaning: 'tree, wood',
          reading: 'もく, き',
          level: 'N5',
          examples: [
            { sentence: '木曜日です。', reading: 'もくようびです。', meaning: 'It is Thursday.' },
            { sentence: '大きい木です。', reading: 'おおきいきです。', meaning: 'It is a big tree.' },
          ],
          memoryTip: 'A trunk with branches and roots.',
        },
        {
          kanji: '金',
          meaning: 'gold, money',
          reading: 'きん, かね',
          level: 'N5',
          examples: [
            { sentence: '金曜日です。', reading: 'きんようびです。', meaning: 'It is Friday.' },
            { sentence: 'お金があります。', reading: 'おかねがあります。', meaning: 'I have money.' },
          ],
          memoryTip: 'Gold buried under the roof of the earth.',
        },
        {
          kanji: '土',
          meaning: 'earth, soil',
          reading: 'ど, つち',
          level: 'N5',
          examples: [
            { sentence: '土曜日です。', reading: 'どようびです。', meaning: 'It is Saturday.' },
            { sentence: '黒い土です。', reading: 'くろいつちです。', meaning: 'It is black soil.' },
          ],
          memoryTip: 'A plant sprouting from the ground.',
        },
        {
          kanji: '山',
          meaning: 'mountain',
          reading: 'さん, やま',
          level: 'N5',
          examples: [
            { sentence: '富士山です。', reading: 'ふじさんです。', meaning: 'Mount Fuji.' },
            { sentence: '山にのぼります。', reading: 'やまにのぼります。', meaning: 'Climb a mountain.' },
          ],
          memoryTip: 'Three mountain peaks in a row.',
        },
        {
          kanji: '川',
          meaning: 'river',
          reading: 'せん, かわ',
          level: 'N5',
          examples: [
            { sentence: '川でおよぎます。', reading: 'かわでおよぎます。', meaning: 'Swim in the river.' },
            { sentence: 'きれいな川です。', reading: 'きれいなかわです。', meaning: 'It is a clean river.' },
          ],
          memoryTip: 'Three streams of flowing water.',
        },
        {
          kanji: '人',
          meaning: 'person',
          reading: 'じん, ひと',
          level: 'N5',
          examples: [
            { sentence: '日本人です。', reading: 'にほんじんです。', meaning: 'I am Japanese.' },
            { sentence: 'あの人は誰ですか。', reading: 'あのひとはだれですか。', meaning: 'Who is that person?' },
          ],
          memoryTip: 'Two legs of a walking person.',
        },
      ],
      quiz: [
        {
          type: 'vocabulary',
          question: 'What is the meaning of 「たべる」?',
          kanji: '食べる',
          reading: 'たべる',
          meaning: 'to eat',
          options: ['to drink', 'to eat', 'to read', 'to sleep'],
          answer: 'to eat',
        },
        {
          type: 'vocabulary',
          question: 'What is the meaning of 「いく」?',
          kanji: '行く',
          reading: 'いく',
          meaning: 'to go',
          options: ['to come', 'to go', 'to speak', 'to buy'],
          answer: 'to go',
        },
        {
          type: 'vocabulary',
          question: 'What does 「みず」 mean?',
          kanji: '水',
          reading: 'みず',
          meaning: 'water',
          options: ['tea', 'water', 'milk', 'juice'],
          answer: 'water',
        },
        {
          type: 'vocabulary',
          question: 'What does 「あたらしい」 mean?',
          kanji: '新しい',
          reading: 'あたらしい',
          meaning: 'new',
          options: ['old', 'expensive', 'new', 'cheap'],
          answer: 'new',
        },
        {
          type: 'vocabulary',
          question: 'What does 「ともだち」 mean?',
          kanji: '友達',
          reading: 'ともだち',
          meaning: 'friend',
          options: ['teacher', 'friend', 'student', 'parent'],
          answer: 'friend',
        },
        {
          type: 'reading',
          question: 'What is the reading of 「本」?',
          kanji: '本',
          reading: 'ほん',
          meaning: 'book',
          options: ['ほん', 'やま', 'みず', 'ひと'],
          answer: 'ほん',
        },
        {
          type: 'reading',
          question: 'What is the reading of 「大きい」?',
          kanji: '大きい',
          reading: 'おおきい',
          meaning: 'big',
          options: ['ちいさい', 'おおきい', 'あたらしい', 'ふるい'],
          answer: 'おおきい',
        },
        {
          type: 'reading',
          question: 'What is the reading of 「話す」?',
          kanji: '話す',
          reading: 'はなす',
          meaning: 'to speak',
          options: ['はなす', 'きく', 'みる', 'かく'],
          answer: 'はなす',
        },
        {
          type: 'reading',
          question: 'What is the reading of 「見る」?',
          kanji: '見る',
          reading: 'みる',
          meaning: 'to see',
          options: ['みる', 'いく', 'たべる', 'のむ'],
          answer: 'みる',
        },
        {
          type: 'reading',
          question: 'What is the reading of 「小さい」?',
          kanji: '小さい',
          reading: 'ちいさい',
          meaning: 'small',
          options: ['ながい', 'おおきい', 'ちいさい', 'たかい'],
          answer: 'ちいさい',
        },
        {
          type: 'kanji',
          question: 'What is the meaning of the kanji 「日」?',
          kanji: '日',
          reading: 'にち',
          meaning: 'day / sun',
          options: ['moon', 'fire', 'day / sun', 'water'],
          answer: 'day / sun',
        },
        {
          type: 'kanji',
          question: 'What is the meaning of the kanji 「月」?',
          kanji: '月',
          reading: 'げつ',
          meaning: 'moon / month',
          options: ['sun', 'moon / month', 'tree', 'gold'],
          answer: 'moon / month',
        },
        {
          type: 'kanji',
          question: 'What is the meaning of the kanji 「山」?',
          kanji: '山',
          reading: 'やま',
          meaning: 'mountain',
          options: ['river', 'mountain', 'field', 'forest'],
          answer: 'mountain',
        },
        {
          type: 'kanji',
          question: 'What is the meaning of the kanji 「川」?',
          kanji: '川',
          reading: 'かわ',
          meaning: 'river',
          options: ['lake', 'ocean', 'river', 'mountain'],
          answer: 'river',
        },
        {
          type: 'kanji',
          question: 'What is the meaning of the kanji 「人」?',
          kanji: '人',
          reading: 'ひと',
          meaning: 'person',
          options: ['child', 'person', 'dog', 'tree'],
          answer: 'person',
        },
        {
          type: 'grammar',
          question: 'Which sentence correctly means "I drink water"?',
          kanji: '',
          reading: '',
          meaning: 'grammar',
          options: [
            'みずを のみます。',
            'みずは たべます。',
            'みずに いきます。',
            'みずで みます。',
          ],
          answer: 'みずを のみます。',
        },
        {
          type: 'grammar',
          question: 'Which sentence means "This is a book"?',
          kanji: '',
          reading: '',
          meaning: 'grammar',
          options: [
            'これは 本です。',
            'これは 本をです。',
            'これへ 本です。',
            'これの 本ます。',
          ],
          answer: 'これは 本です。',
        },
        {
          type: 'grammar',
          question: 'Fill in the blank: がっこう____ いきます。 (I go to school)',
          kanji: '',
          reading: '',
          meaning: 'grammar',
          options: ['へ', 'を', 'は', 'も'],
          answer: 'へ',
        },
        {
          type: 'grammar',
          question: 'Which particle marks the direct object of a verb?',
          kanji: '',
          reading: '',
          meaning: 'grammar',
          options: ['を', 'へ', 'に', 'は'],
          answer: 'を',
        },
        {
          type: 'grammar',
          question: 'What is the polite negative form of 「たべます」 (to eat)?',
          kanji: '',
          reading: '',
          meaning: 'grammar',
          options: ['たべません', 'たべた', 'たべないでした', 'たべますん'],
          answer: 'たべません',
        },
      ],
      isFallback: true,
    };
  }

  // ---------------------------------------------------------------------
  // Cron Job (Scheduled daily at 4:00 AM IST)
  // ---------------------------------------------------------------------
  @Cron('0 4 * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async handleDailyLearningCron() {
    this.logger.log('⏰ Running Daily Learning Cron Job (Asia/Kolkata)');
    try {
      await this.getDailyLearning(true);
      this.logger.log('✅ Daily Learning Generated Successfully via Cron');
    } catch (error: any) {
      this.logger.error(`❌ Daily Learning Cron Failed: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------
  // Public Entry Point
  // ---------------------------------------------------------------------
  async getDailyLearning(forceRefresh = false) {
    if (this.inFlight) {
      this.logger.log('⏳ Generation already in progress, awaiting existing call...');
      return this.inFlight;
    }

    this.inFlight = this.generateDailyLearning(forceRefresh);
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  // ---------------------------------------------------------------------
  // Generation & Caching Pipeline
  // ---------------------------------------------------------------------
  private async generateDailyLearning(forceRefresh = false) {
    const today = this.getTodayInIST();

    // 1. Check DB first (unless forceRefresh is requested)
    if (!forceRefresh) {
      const existing = await this.prisma.dailyLearning.findUnique({
        where: { date: today },
      });

      // Verify that existing content has a populated, non-empty quiz
      if (
        existing &&
        Array.isArray(existing.quiz) &&
        (existing.quiz as any[]).length >= 5
      ) {
        return existing;
      }
    }

    // 2. Random seed for prompt variety
    const randomSeed = Math.floor(Math.random() * 100000);

    // 3. Fetch past entries to reduce repetitive vocabulary
    let usedWordsList = '';
    let usedKanjiList = '';
    let usedTipsList = '';

    try {
      const previousData = await this.prisma.dailyLearning.findMany({
        take: 15,
        orderBy: { date: 'desc' },
        select: { vocabulary: true, kanji: true, tip: true },
      });

      const usedWords = new Set<string>();
      const usedKanji = new Set<string>();
      const usedTips = new Set<string>();

      for (const d of previousData) {
        const vocab = d.vocabulary as any[];
        if (Array.isArray(vocab)) {
          for (const v of vocab) {
            if (v?.word && usedWords.size < 50) usedWords.add(v.word);
          }
        }

        const kanji = d.kanji as any[];
        if (Array.isArray(kanji)) {
          for (const k of kanji) {
            if (k?.kanji && usedKanji.size < 30) usedKanji.add(k.kanji);
          }
        }

        if (d.tip && usedTips.size < 5) usedTips.add(d.tip);
      }

      usedWordsList = Array.from(usedWords).slice(0, 25).join(',');
      usedKanjiList = Array.from(usedKanji).slice(0, 20).join(',');
      usedTipsList = Array.from(usedTips).slice(0, 3).join('|');
    } catch (e: any) {
      this.logger.warn(`Could not read past entries: ${e.message}`);
    }

    // 4. Construct compact, strict prompt
    const prompt = `Date:${today} Seed:${randomSeed}

Generate JLPT N5 Japanese daily learning content as JSON only. No markdown. No explanation.

${usedWordsList ? `AVOID these vocabulary: ${usedWordsList}` : ''}
${usedKanjiList ? `AVOID these kanji: ${usedKanjiList}` : ''}
${usedTipsList ? `AVOID these tips: ${usedTipsList}` : ''}
AVOID common words: 私,あなた,学生,です

RULES:
- Mix nouns, verbs, adjectives
- Short sentences (max 6-8 words)
- All readings in hiragana only
- Output ONLY valid JSON, parseable by JSON.parse()

REQUIRED OUTPUT:
{
  "tip": "short motivational tip in English or Japanese with English translation",
  "vocabulary": [10 items: {word,reading,meaning,level:"N5",example,exampleReading,exampleMeaning}],
  "grammar": [2 items: {title,level:"N5",explanation,examples:[3 items:{sentence,reading,meaning}]}],
  "kanji": [10 items: {kanji,meaning,reading,level:"N5",examples:[2 items:{sentence,reading,meaning}],memoryTip}],
  "quiz": [20 items: {type,question,kanji,reading,meaning,options:[4 strings],answer}]
}

QUIZ RULES:
- type: vocabulary|reading|kanji|grammar
- Exactly 5 of each type (5+5+5+5=20)
- reading must be hiragana only
- options must have exactly 4 unique items
- answer must be a string and MUST appear in options
- randomize answer position

EXAMPLE QUIZ ITEM:
{"type":"reading","question":"What is the reading of 短い?","kanji":"短い","reading":"みじかい","meaning":"short","options":["ながい","みじかい","あたらしい","ふるい"],"answer":"みじかい"}`;

    try {
      const text = await this.callAi(prompt);

      // 5. Safe JSON parse
      let parsed: any;
      try {
        const jsonText = this.extractJsonObject(text);
        parsed = JSON.parse(jsonText);
      } catch (err: any) {
        this.logger.error(`❌ JSON Parse Error: ${err.message}`);
        throw new Error('AI response could not be parsed as valid JSON.');
      }

      // 6. Basic structural validation
      if (
        !parsed?.tip ||
        !Array.isArray(parsed?.vocabulary) ||
        !Array.isArray(parsed?.grammar) ||
        !Array.isArray(parsed?.kanji) ||
        !Array.isArray(parsed?.quiz)
      ) {
        throw new Error('AI response missing required JSON fields.');
      }

      // 7. Normalization: ensure level and required properties exist
      parsed.vocabulary = parsed.vocabulary
        .filter((v: any) => v && v.word && v.meaning)
        .map((v: any) => ({
          ...v,
          level: v.level || 'N5',
          reading: v.reading || v.word,
          example: v.example || `${v.word}です。`,
          exampleReading: v.exampleReading || `${v.reading || v.word}です。`,
          exampleMeaning: v.exampleMeaning || v.meaning,
        }));

      parsed.kanji = parsed.kanji
        .filter((k: any) => k && k.kanji && k.meaning)
        .map((k: any) => ({
          ...k,
          level: k.level || 'N5',
          reading: k.reading || '',
          examples: Array.isArray(k.examples) ? k.examples : [],
          memoryTip: k.memoryTip || '',
        }));

      parsed.grammar = parsed.grammar
        .filter((g: any) => g && g.title)
        .map((g: any) => ({
          ...g,
          level: g.level || 'N5',
          explanation: g.explanation || '',
          examples: Array.isArray(g.examples) ? g.examples : [],
        }));

      // 8. Normalize & validate quiz questions
      function shuffle<T>(arr: T[]): T[] {
        return [...arr].sort(() => Math.random() - 0.5);
      }

      const validQuizItems: any[] = [];

      for (const q of parsed.quiz) {
        if (!q || !q.question) continue;

        let options: string[] = [];
        if (Array.isArray(q.options)) {
          options = q.options
            .map((opt: any) => String(opt || '').trim())
            .filter((opt: string) => opt.length > 0);
        }

        let answer = String(q.answer || '').trim();

        // If answer was given as letter "A", "B", "C", "D", resolve to option text
        if (
          answer.length === 1 &&
          answer.toUpperCase().charCodeAt(0) >= 65 &&
          answer.toUpperCase().charCodeAt(0) < 65 + options.length
        ) {
          const idx = answer.toUpperCase().charCodeAt(0) - 65;
          answer = options[idx];
        }

        // Ensure answer exists
        if (!answer && options.length > 0) {
          answer = options[0];
        }

        // Ensure unique options
        const uniqueSet = new Set<string>(options);
        if (answer) uniqueSet.add(answer);

        let finalOptions = Array.from(uniqueSet);

        // Fill up to 4 options if fewer
        const defaultFillers = ['なし', 'ちがう', 'これではない', 'わからない'];
        let fillerIdx = 0;
        while (finalOptions.length < 4) {
          const filler = defaultFillers[fillerIdx % defaultFillers.length] + ` (${finalOptions.length + 1})`;
          finalOptions.push(filler);
          fillerIdx++;
        }

        // Limit to 4 options, ensuring answer is included
        if (finalOptions.length > 4) {
          const wrongOptions = finalOptions.filter((o) => o !== answer);
          finalOptions = [answer, ...wrongOptions.slice(0, 3)];
        }

        // Shuffle options so answer isn't always in same position
        finalOptions = shuffle(finalOptions);

        validQuizItems.push({
          type: q.type || 'vocabulary',
          question: q.question,
          kanji: q.kanji || '',
          reading: q.reading || '',
          meaning: q.meaning || '',
          options: finalOptions,
          answer: answer || finalOptions[0],
        });
      }

      parsed.quiz = validQuizItems;

      // Ensure minimum threshold
      if (parsed.vocabulary.length < 3 || parsed.quiz.length < 5) {
        throw new Error('AI generated insufficient questions/vocabulary items.');
      }

      // 9. Save to Database (upsert to handle both fresh creates and re-generations)
      const saved = await this.prisma.dailyLearning.upsert({
        where: { date: today },
        create: {
          date: today,
          tip: parsed.tip,
          vocabulary: parsed.vocabulary,
          grammar: parsed.grammar,
          quiz: parsed.quiz,
          kanji: parsed.kanji,
        },
        update: {
          tip: parsed.tip,
          vocabulary: parsed.vocabulary,
          grammar: parsed.grammar,
          quiz: parsed.quiz,
          kanji: parsed.kanji,
        },
      });

      this.logger.log(`✅ Daily Learning content successfully saved to database for ${today}`);
      return saved;
    } catch (error: any) {
      this.logger.error(`❌ Daily Learning Generation Error: ${error.message}`);

      // 10. Fallback: try last valid DB record that has actual quiz items
      try {
        const lastGood = await this.prisma.dailyLearning.findFirst({
          where: {
            date: { not: today },
          },
          orderBy: { date: 'desc' },
        });

        const hasValidQuiz =
          lastGood &&
          Array.isArray(lastGood.quiz) &&
          (lastGood.quiz as any[]).length >= 5 &&
          (lastGood.quiz as any[]).every(
            (q: any) =>
              q &&
              q.question &&
              Array.isArray(q.options) &&
              q.options.length >= 2 &&
              q.answer,
          );

        if (hasValidQuiz) {
          this.logger.warn(`⚠️ Serving cached content from ${lastGood.date} as fallback`);
          return {
            ...lastGood,
            date: today,
            isFallback: true,
            fallbackFromDate: lastGood.date,
          };
        }
      } catch (dbErr: any) {
        this.logger.warn(`Could not fetch fallback from database: ${dbErr.message}`);
      }

      // 11. Final Safety Net: Rich built-in package (guarantees Flutter quiz ALWAYS works)
      this.logger.warn('⚠️ Serving rich built-in JLPT N5 content as fallback');
      return this.getBuiltInLearningData(today);
    }
  }
}