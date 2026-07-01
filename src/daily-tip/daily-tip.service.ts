import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class DailyLearningService {
  private readonly openRouterKey = process.env.OPENROUTER_API_KEY;
  private readonly geminiKey = process.env.GEMINI_API_KEY;

  constructor(private prisma: PrismaService) {}

  /// 🔥 PRIMARY: OpenRouter (DeepSeek) — using the :free variant so it never
  /// consumes paid credits. Non-free deepseek/deepseek-chat WILL 402 as soon
  /// as your balance is low, regardless of max_tokens.
  private async callDeepSeek(prompt: string) {
    if (!this.openRouterKey) {
      throw new Error('Missing OPENROUTER_API_KEY.');
    }

try {
  return await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'openrouter/free', // Automatically selects an available free model
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${this.openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'Daily JLPT Learning',
      },
      timeout: 60000,
    },
  );
} catch (error) {
  console.error('❌ OpenRouter failed');

  if (axios.isAxiosError(error) && error.response) {
    console.error('Status:', error.response.status);
    console.error('Data:', JSON.stringify(error.response.data));
  } else if (error instanceof Error) {
    console.error('Error:', error.message);
  }

  throw error;
}}

  /// 🔥 FALLBACK: Gemini with retry on 503 AND 429 (rate/quota related)
private async callGemini(prompt: string, attempt = 1): Promise<any> {
  try {
    return await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiKey}`,
      {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      },
      {
        timeout: 60000,
      },
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message =
        error.response?.data?.error?.message ?? error.message;

      // Don't retry if the account has no quota.
      if (status === 429 && message.includes('limit: 0')) {
        console.error('❌ Gemini quota exhausted (limit: 0).');
        throw error;
      }

      // Retry for temporary overloads or rate limits.
      if ((status === 429 || status === 503) && attempt < 3) {
        const delay = attempt * 5000;
        console.warn(
          `⚠️ Gemini ${status}, retrying in ${delay / 1000}s (attempt ${attempt}/3)...`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));

        return this.callGemini(prompt, attempt + 1);
      }
    }

    throw error;
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
    } catch (error) {
      console.error('❌ Cron Job Failed:', error.message);
    }
  }

  async getDailyLearning(retry = false) {
    const today = new Date().toISOString().split('T')[0];

    /// ✅ 1. CHECK DB
    const existing = await this.prisma.dailyLearning.findUnique({
      where: { date: today },
    });
    if (existing) return existing;

    /// 🔥 2. RANDOMNESS + DATE
    const randomSeed = Math.floor(Math.random() * 100000);

    /// 🔥 3. GET USED WORDS (ANTI-DUPLICATE) — reduced window to 30 to save prompt tokens
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

    /// 🔥 4. COMPACT PROMPT
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

    let text: string | undefined;

    try {
      /// 🔥 5. TRY DEEPSEEK FIRST
/// 🔥 5. TRY OPENROUTER FIRST
try {
const response = await this.callDeepSeek(prompt);

  console.log(
    '🟢 OpenRouter Response:',
    JSON.stringify(response.data, null, 2),
  );

  const choice = response.data?.choices?.[0];

  if (!choice) {
    throw new Error('No choices returned from OpenRouter');
  }

  if (typeof choice.message?.content === 'string') {
    text = choice.message.content;
  } else if (Array.isArray(choice.message?.content)) {
    text = choice.message.content
      .map((part: any) => part.text || '')
      .join('');
  } else if (typeof choice.text === 'string') {
    text = choice.text;
  } else if (typeof choice.content === 'string') {
    text = choice.content;
  }

  if (!text || text.trim() === '') {
    throw new Error(
      `OpenRouter returned empty content.\n${JSON.stringify(
        response.data,
        null,
        2,
      )}`,
    );
  }

  console.log('✅ OpenRouter response received');
} catch (openRouterError: any) {
  const status = openRouterError.response?.status;

  if (status === 402) {
    console.warn('⚠️ OpenRouter credits exhausted, switching to Gemini...');
  } else {
    console.warn('⚠️ OpenRouter failed, switching to Gemini...');
  }

  const response = await this.callGemini(prompt);

  text =
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  console.log('✅ Gemini response received');
}

      if (!text) throw new Error('Empty AI response');

      /// 🔧 6. SAFE PARSE
      let parsed: any;
      try {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) {
          console.error('RAW RESPONSE:', text);
          throw new Error('Invalid JSON format — no JSON object found');
        }
        parsed = JSON.parse(match[0]);
      } catch (err) {
        console.error('❌ PARSE ERROR:', err.message);
        console.error('RAW:', text?.slice(0, 500));
        throw new Error('JSON parse failed');
      }

      /// ✅ 7. STRUCTURE VALIDATION
      if (
        !parsed?.tip ||
        !Array.isArray(parsed?.vocabulary) ||
        !Array.isArray(parsed?.grammar) ||
        !Array.isArray(parsed?.kanji) ||
        !Array.isArray(parsed?.quiz)
      ) {
        throw new Error('Invalid AI structure — missing required fields');
      }

      /// 🔥 8. FILTER + VALIDATE
      parsed.vocabulary = parsed.vocabulary.filter(
        (v: any) => v.level === 'N5' && v.word && v.word.length <= 6,
      );
      parsed.kanji = parsed.kanji.filter((k: any) => k.level === 'N5');
      parsed.grammar = parsed.grammar.filter((g: any) => g.level === 'N5');

      parsed.vocabulary = parsed.vocabulary.filter(
        (v: any) => !usedWords.has(v.word),
      );
      parsed.kanji = parsed.kanji.filter(
        (k: any) => !usedKanji.has(k.kanji),
      );

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
          return this.getDailyLearning(true);
        }
        throw new Error('Invalid AI content after retry');
      }

      /// 🔥 8.5 FIX QUIZ ANSWER POSITION
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

      /// ✅ 9. SAVE TO DB
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
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios Error:', error.response?.data);
      }
      console.error('❌ Daily Learning Error:', error.message);

      // 🔥 10. BOTH PROVIDERS FAILED — fall back to the most recent DB entry
      // instead of returning an empty payload, so the app still shows real
      // content to the user.
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

      // No AI response AND nothing in the DB at all — last resort only.
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