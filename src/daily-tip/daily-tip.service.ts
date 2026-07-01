import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class DailyLearningService {
  private readonly openRouterKey = process.env.OPENROUTER_API_KEY;
  private readonly geminiKey = process.env.GEMINI_API_KEY;

  // 🔥 A short rotation of pinned, non-reasoning free models on OpenRouter.
  // Do NOT use the 'openrouter/free' auto-router — it can hand you a
  // reasoning model (nvidia/nemotron, poolside/laguna, etc.) that burns the
  // whole max_tokens budget on internal "reasoning" text and returns
  // finish_reason:"length" with content:null before ever writing JSON.
  // Any single free model can also get upstream-rate-limited (e.g. Venice
  // 429 on llama-3.3-70b) independent of your own OpenRouter quota, so we
  // try a short list before giving up on OpenRouter entirely.
  private readonly FREE_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-chat-v3-0324:free',
    'qwen/qwen-2.5-72b-instruct:free',
  ];

  // 🔥 In-memory lock so two concurrent requests (e.g. overlapping web
  // requests, or a retry racing a fresh call) don't both independently
  // hammer OpenRouter + Gemini for the same date at the same time. This is
  // per-process; if you run multiple instances, move this to a DB-level
  // lock (e.g. a short-lived "generating" row) instead.
  private inFlight: Promise<any> | null = null;

  // 🔥 Circuit breaker for Gemini. A 429 with "limit: 0" means the API key /
  // project has NO free-tier quota granted at all — this is a Google Cloud
  // console / billing issue, not something retries fix. Once we see it, stop
  // wasting a full request+backoff cycle on Gemini for the rest of this
  // process's lifetime, and go straight to the DB fallback instead.
  private geminiQuotaDead = false;

  constructor(private prisma: PrismaService) {}

  private async callOpenRouterModel(prompt: string, model: string) {
    return axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000, // headroom for 10 vocab + 10 kanji + 2 grammar + 20 quiz items
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

  /// 🔥 PRIMARY: try each free OpenRouter model in turn. Moves to the next
  /// model immediately on 429/5xx instead of waiting out Retry-After, since
  /// we have other free models to try first and Gemini as a final fallback.
  private async callDeepSeek(prompt: string) {
    if (!this.openRouterKey) {
      throw new Error('Missing OPENROUTER_API_KEY.');
    }

    let lastError: any;

    for (const model of this.FREE_MODELS) {
      try {
        const response = await this.callOpenRouterModel(prompt, model);
        console.log(`✅ OpenRouter model succeeded: ${model}`);
        return response;
      } catch (error: any) {
        lastError = error;
        const status = error.response?.status;
        const raw = error.response?.data?.error?.metadata?.raw || error.message;
        console.error(`❌ OpenRouter model failed: ${model} (status ${status})`);
        console.error('Detail:', raw);

        // 402 (out of credits) and 429 (rate limited, ours or upstream
        // provider's) both mean "try the next model in the list".
        if (status === 402 || status === 429 || status === 503) {
          continue;
        }
        // Anything else (auth error, malformed request, etc.) is unlikely
        // to be fixed by switching models — fail fast.
        throw error;
      }
    }

    console.error('❌ All free OpenRouter models exhausted');
    throw lastError;
  }

  /// 🔥 FALLBACK: Gemini with retry on 503 and transient 429s. Short-circuits
  /// immediately once the quota is confirmed dead for this process.
  private async callGemini(prompt: string, attempt = 1): Promise<any> {
    if (this.geminiQuotaDead) {
      throw new Error('Gemini quota previously confirmed dead (limit: 0) — skipping call.');
    }

    try {
      return await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            response_mime_type: 'application/json',
            maxOutputTokens: 4000,
          },
        },
        { timeout: 60000 },
      );
    } catch (error: any) {
      const status = error.response?.status;
      const message = error.response?.data?.error?.message ?? error.message ?? '';

      // "limit: 0" means no free-tier quota was ever granted to this key/
      // project — a config issue on Google's side, not a transient state.
      if (status === 429 && message.includes('limit: 0')) {
        console.error('❌ Gemini quota exhausted (limit: 0) — marking dead for this process.');
        this.geminiQuotaDead = true;
        throw error;
      }

      if ((status === 503 || status === 429) && attempt < 3) {
        const delay = attempt * 5000; // 5s, 10s
        console.warn(`⚠️ Gemini ${status}, retrying in ${delay / 1000}s (attempt ${attempt}/3)...`);
        await new Promise((res) => setTimeout(res, delay));
        return this.callGemini(prompt, attempt + 1);
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
    } catch (error: any) {
      console.error('❌ Cron Job Failed:', error.message);
    }
  }

  /// Public entry point — wraps the real logic in the in-flight lock so
  /// concurrent callers share a single generation attempt instead of each
  /// independently hammering OpenRouter + Gemini.
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
      /// 🔥 5. TRY OPENROUTER MODEL ROTATION FIRST, THEN GEMINI
      try {
        const response = await this.callDeepSeek(prompt);
        const choice = response.data?.choices?.[0];
        if (!choice) throw new Error('No choices returned from OpenRouter');

        if (typeof choice.message?.content === 'string') {
          text = choice.message.content;
        } else if (Array.isArray(choice.message?.content)) {
          text = choice.message.content.map((part: any) => part.text || '').join('');
        }

        // A reasoning model that got truncated mid-thought looks like this:
        // finish_reason "length" with empty/null content but populated
        // reasoning. Treat that as a hard failure rather than trying to
        // parse JSON out of it.
        if (!text || text.trim() === '') {
          throw new Error(
            `OpenRouter returned empty content (finish_reason: ${choice.finish_reason ?? 'unknown'})`,
          );
        }
        console.log('✅ OpenRouter response received');
      } catch (openRouterError: any) {
        console.warn('⚠️ OpenRouter exhausted, switching to Gemini...');
        const response = await this.callGemini(prompt);
        text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log('✅ Gemini fallback response received');
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
      } catch (err: any) {
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
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('Axios Error:', error.response?.data);
      }
      console.error('❌ Daily Learning Error:', error.message);

      /// 🔥 10. BOTH PROVIDERS FAILED — fall back to the most recent DB entry
      /// instead of returning an empty payload, so the app still shows real
      /// content to the user.
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