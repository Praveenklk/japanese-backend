import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class DailyLearningService {
  private readonly openRouterKey = process.env.OPENROUTER_API_KEY;
  private readonly geminiKey = process.env.GEMINI_API_KEY;

  // Use OpenRouter's free router instead of hardcoded free model slugs.
  // OpenRouter says this router automatically selects an available free model.
  private readonly OPENROUTER_MODEL = 'openrouter/free';

  // In-memory lock so overlapping requests share one generation attempt.
  private inFlight: Promise<any> | null = null;

  // Circuit breaker for Gemini when quota is confirmed dead.
  private geminiQuotaDead = false;

  constructor(private prisma: PrismaService) {}

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
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  if (
    cleaned.startsWith('We need to') ||
    cleaned.startsWith("Let's") ||
    cleaned.startsWith('I need to')
  ) {
    throw new Error('AI returned reasoning instead of JSON.');
  }

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');

  if (first === -1 || last === -1) {
    throw new Error('No JSON object found.');
  }

  return cleaned.substring(first, last + 1);
}

private async callOpenRouter(prompt: string) {
  if (!this.openRouterKey) {
    throw new Error('Missing OPENROUTER_API_KEY.');
  }

  return axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: this.OPENROUTER_MODEL,

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
      max_tokens: 2500,

      response_format: {
        type: 'json_object',
      },
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
}

  private async callGemini(prompt: string, attempt = 1): Promise<any> {
    if (this.geminiQuotaDead) {
      throw new Error('Gemini quota previously confirmed dead (limit: 0) — skipping call.');
    }

    if (!this.geminiKey) {
      throw new Error('Missing GEMINI_API_KEY.');
    }

    try {
      return await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            response_mime_type: 'application/json',
            maxOutputTokens: 2500,
          },
        },
        { timeout: 60000 },
      );
    } catch (error: any) {
      const status = error.response?.status;
      const message = error.response?.data?.error?.message ?? error.message ?? '';

      if (status === 429 && message.includes('limit: 0')) {
        console.error('❌ Gemini quota exhausted (limit: 0) — marking dead for this process.');
        this.geminiQuotaDead = true;
        throw error;
      }

      if ((status === 503 || status === 429) && attempt < 3) {
        const delay = attempt * 5000;
        console.warn(`⚠️ Gemini ${status}, retrying in ${delay / 1000}s (attempt ${attempt}/3)...`);
        await new Promise((res) => setTimeout(res, delay));
        return this.callGemini(prompt, attempt + 1);
      }

      throw error;
    }
  }

private async callAi(prompt: string): Promise<string> {
  try {
    const response = await this.callOpenRouter(prompt);

    const choice = response.data?.choices?.[0];

    if (!choice) {
      throw new Error('No choices returned from OpenRouter');
    }

    console.log('OpenRouter Choice:');
    console.log(JSON.stringify(choice, null, 2));

    let text = '';

    const content = choice.message?.content;

    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .map((p: any) => p.text ?? '')
        .join('');
    }

    text = text.trim();

    if (!text) {
      throw new Error('Model returned empty content.');
    }

    // Reject reasoning responses
    if (
      text.startsWith('We need to') ||
      text.startsWith("Let's") ||
      text.startsWith('I need to') ||
      text.startsWith('First,') ||
      text.includes('reasoning')
    ) {
      throw new Error('Model returned reasoning instead of JSON.');
    }

    console.log('✅ OpenRouter JSON received');

    return text;
  } catch (openRouterError: any) {
    console.warn('⚠️ OpenRouter failed, switching to Gemini...');

    const response = await this.callGemini(prompt);

    const text =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text.trim()) {
      throw new Error('Gemini returned empty response.');
    }

    return text;
  }
}

  @Cron('0 4 * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async handleDailyLearningCron() {
    console.log('⏰ Running Daily Learning Cron Job at 9:30 AM IST');
    try {
      await this.getDailyLearning();
      console.log('✅ Daily Learning Generated Successfully');
    } catch (error: any) {
      console.error('❌ Cron Job Failed:', error.message);
    }
  }

  async getDailyLearning(retry = false) {
    if (this.inFlight) {
      console.log('⏳ Generation already in progress, awaiting existing call...');
      return this.inFlight;
    }

    this.inFlight = this.generateDailyLearning(retry);
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async generateDailyLearning(retry = false) {
    const today = this.getTodayInIST();

    // 1. Check DB first
    const existing = await this.prisma.dailyLearning.findUnique({
      where: { date: today },
    });
    if (existing) return existing;

    // 2. Random seed
    const randomSeed = Math.floor(Math.random() * 100000);

    // 3. Get previous content to avoid duplicates
    const previousData = await this.prisma.dailyLearning.findMany({
      take: 30,
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
          if (v?.word && usedWords.size < 100) usedWords.add(v.word);
        }
      }

      const kanji = d.kanji as any[];
      if (Array.isArray(kanji)) {
        for (const k of kanji) {
          if (k?.kanji && usedKanji.size < 100) usedKanji.add(k.kanji);
        }
      }

      if (d.tip && usedTips.size < 20) usedTips.add(d.tip);
    }

    const usedWordsList = Array.from(usedWords).slice(0, 30).join(',');
    const usedKanjiList = Array.from(usedKanji).slice(0, 30).join(',');
    const usedTipsList = Array.from(usedTips).slice(0, 5).join('|');

    // 4. Compact prompt
    const prompt = `Date:${today} Seed:${randomSeed}

Generate JLPT N5 Japanese daily learning content as JSON only. No markdown. No explanation.

AVOID these vocabulary: ${usedWordsList}
AVOID these kanji: ${usedKanjiList}
AVOID these tips: ${usedTipsList}
AVOID common words: 私,あなた,学生,です

RULES:
- Mix nouns, verbs, adjectives
- Short sentences (max 6-8 words)
- All readings in hiragana only
- Output ONLY valid JSON, parseable by JSON.parse()

REQUIRED OUTPUT:
{
  "tip": "short motivational tip",
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
- answer must appear in options
- randomize answer position

EXAMPLE QUIZ ITEM:
{"type":"reading","question":"What is the reading of 短い?","kanji":"短い","reading":"みじかい","meaning":"short","options":["ながい","みじかい","あたらしい","ふるい"],"answer":"みじかい"}`;

    try {
      const text = await this.callAi(prompt);

      // 5. Safe parse
      let parsed: any;
      try {
        const jsonText = this.extractJsonObject(text);
        parsed = JSON.parse(jsonText);
      } catch (err: any) {
        console.error('❌ PARSE ERROR:', err.message);
        console.error('RAW:', text?.slice(0, 500));
        throw new Error('JSON parse failed');
      }

      // 6. Structure validation
      if (
        !parsed?.tip ||
        !Array.isArray(parsed?.vocabulary) ||
        !Array.isArray(parsed?.grammar) ||
        !Array.isArray(parsed?.kanji) ||
        !Array.isArray(parsed?.quiz)
      ) {
        throw new Error('Invalid AI structure — missing required fields');
      }

      // 7. Filter + validate
      parsed.vocabulary = parsed.vocabulary.filter(
        (v: any) => v.level === 'N5' && v.word && v.word.length <= 6,
      );
      parsed.kanji = parsed.kanji.filter((k: any) => k.level === 'N5');
      parsed.grammar = parsed.grammar.filter((g: any) => g.level === 'N5');

      parsed.vocabulary = parsed.vocabulary.filter((v: any) => !usedWords.has(v.word));
      parsed.kanji = parsed.kanji.filter((k: any) => !usedKanji.has(k.kanji));

      if (usedTips.has(parsed.tip)) {
        parsed.tip = 'Consistency is key. Keep learning every day 💪';
      }

      if (
        parsed.vocabulary.length < 5 ||
        parsed.kanji.length < 5 ||
        parsed.grammar.length < 1
      ) {
        console.warn('⚠️ Too many duplicates or insufficient N5 content');
        if (!retry) {
          return this.generateDailyLearning(true);
        }
        throw new Error('Invalid AI content after retry');
      }

      // 8. Fix quiz answer position and ensure exactly 4 options
      function shuffleArray<T>(array: T[]): T[] {
        return array.sort(() => Math.random() - 0.5);
      }

      parsed.quiz = parsed.quiz.map((q: any) => {
        if (!q.options || !q.answer) return q;

        const uniqueOptions = Array.from(new Set<string>(q.options)).filter(
          (opt): opt is string => typeof opt === 'string',
        );

        if (!uniqueOptions.includes(q.answer)) {
          uniqueOptions[0] = q.answer;
        }

        const wrongOptions = uniqueOptions.filter((opt: string) => opt !== q.answer);
        const selectedWrong = shuffleArray([...wrongOptions]).slice(0, 3);

        while (selectedWrong.length < 3) {
          selectedWrong.push('なし');
        }

        const randomIndex = Math.floor(Math.random() * 4);
        const finalOptions = [...selectedWrong];
        finalOptions.splice(randomIndex, 0, q.answer);

        return { ...q, options: finalOptions };
      });

      // 9. Save to DB
      const saved = await this.prisma.dailyLearning.create({
        data: {
          date: today,
          tip: parsed.tip,
          vocabulary: parsed.vocabulary,
          grammar: parsed.grammar,
          quiz: parsed.quiz,
          kanji: parsed.kanji,
        },
      });

      return saved;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('Axios Error:', error.response?.data);
      }
      console.error('❌ Daily Learning Error:', error.message);

      // 10. Fall back to last cached DB entry
      const lastGood = await this.prisma.dailyLearning.findFirst({
        orderBy: { date: 'desc' },
      });

      if (lastGood) {
        console.warn(`⚠️ Serving cached content from ${lastGood.date} as fallback`);
        return {
          ...lastGood,
          date: today,
          isFallback: true,
          fallbackFromDate: lastGood.date,
        };
      }

      // Last resort
      console.error('❌ No AI response and no cached DB content available');
      return {
        date: today,
        tip: 'Consistency beats intensity. Study a little every day! 💪',
        vocabulary: [],
        grammar: [],
        kanji: [],
        quiz: [],
        isFallback: true,
      };
    }
  }
}