import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';

type QuizType = 'vocabulary' | 'reading' | 'kanji' | 'grammar';

interface QuizItem {
  type: QuizType;
  question: string;
  kanji: string;
  reading: string;
  meaning: string;
  options: string[];
  answer: string;
}

interface DailyLearningPayload {
  tip: string;
  vocabulary: any[];
  grammar: any[];
  kanji: any[];
  quiz: QuizItem[];
}

@Injectable()
export class DailyLearningService {
  private readonly openRouterKey = process.env.OPENROUTER_API_KEY;
  private readonly geminiKey = process.env.GEMINI_API_KEY;

  constructor(private prisma: PrismaService) {}

  private getTodayInIST(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private async callDeepSeek(prompt: string) {
    if (!this.openRouterKey) {
      console.error('❌ OPENROUTER_API_KEY is missing in environment variables');
      throw new Error('Missing OPENROUTER_API_KEY. Please set it in environment variables.');
    }

    try {
      return await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'deepseek/deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.9,
        },
        {
          headers: {
            Authorization: `Bearer ${this.openRouterKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        },
      );
    } catch (error: any) {
      console.error('❌ DeepSeek API call failed');

      if (error?.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      } else {
        console.error('Error:', error?.message);
      }

      throw error;
    }
  }

  private async callGemini(prompt: string) {
    if (!this.geminiKey) {
      console.error('❌ GEMINI_API_KEY is missing in environment variables');
      throw new Error('Missing GEMINI_API_KEY. Please set it in environment variables.');
    }

    return await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.9,
        },
      },
      {
        timeout: 120000,
      },
    );
  }

  @Cron('0 4 * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async handleDailyLearningCron() {
    console.log('⏰ Running Daily Learning Cron Job at 4 AM IST');

    try {
      await this.getDailyLearning();
      console.log('✅ Daily Learning Generated Successfully');
    } catch (error: any) {
      console.error('❌ Cron Job Failed:', error?.message || error);
    }
  }

  private buildPrompt(
    today: string,
    randomSeed: number,
    usedWordsList: string,
    usedKanjiList: string,
    usedTipsList: string,
  ) {
    return `
Date: ${today}
Seed: ${randomSeed}

Generate DAILY UNIQUE JLPT N5 Japanese learning content.

IMPORTANT RULES (STRICTLY FOLLOW):

- DO NOT reuse ANY vocabulary from this list:
${usedWordsList}

- DO NOT reuse ANY kanji from this list:
${usedKanjiList}

- DO NOT reuse ANY motivational tips from this list:
${usedTipsList}

- DO NOT generate common beginner words like:
私, あなた, 学生, です

- Use COMPLETELY DIFFERENT content every time
- Include a MIX of nouns, verbs, and adjectives
- Prefer slightly less common JLPT N5 words
- Keep all text short and clean

FAIL CONDITIONS (VERY IMPORTANT):

- If ANY vocabulary is repeated → INVALID RESPONSE
- If ANY kanji is repeated → INVALID RESPONSE
- If tip is similar → INVALID RESPONSE
- If quiz is missing ANY required field → INVALID RESPONSE
- If quiz does not have exactly 30 questions → INVALID RESPONSE
- If quiz distribution is not followed → INVALID RESPONSE

If invalid → REGENERATE internally before returning

STRICT OUTPUT RULES:

- Output ONLY valid JSON
- No markdown
- No explanation
- No trailing commas
- Must be parseable using JSON.parse()

CONTENT REQUIREMENTS:

- Vocabulary: EXACTLY 10 items
- Grammar: EXACTLY 2 items (each 3 examples)
- Kanji: EXACTLY 10 items (each 2 examples)
- Quiz: EXACTLY 30 questions

CRITICAL QUIZ RULES (STRICT):

Each quiz MUST include:

- type (vocabulary | reading | kanji | grammar)
- question
- kanji
- reading (HIRAGANA ONLY)
- meaning (ENGLISH ONLY)
- options (4 items)
- answer

RULES:

- NEVER skip kanji, reading, or meaning
- NEVER hide kanji only inside question
- reading MUST be 100% hiragana (no kanji, no romaji)
- meaning MUST be simple English
- options must contain ONLY ONE correct answer
- options must be relevant and unique
- quiz text must be short

QUIZ DISTRIBUTION RULE (MANDATORY):

The 30 quiz questions MUST include:

- At least 8 Vocabulary questions
- At least 8 Reading questions
- At least 7 Kanji questions
- At least 7 Grammar questions

If distribution is not followed → INVALID RESPONSE

QUIZ TYPES (USE ALL):

1. Reading → kanji → hiragana  
2. Meaning → Japanese → English  
3. Kanji recognition → meaning  
4. Grammar usage  

EXAMPLE QUIZ (REFERENCE):

{
  "type": "reading",
  "question": "What is the reading of 短い?",
  "kanji": "短い",
  "reading": "みじかい",
  "meaning": "short",
  "options": ["ながい", "みじかい", "あたらしい", "ふるい"],
  "answer": "みじかい"
}

FINAL OUTPUT FORMAT:

{
  "tip": "short motivational tip",

  "vocabulary": [
    {
      "word": "",
      "reading": "",
      "meaning": "",
      "level": "N5",
      "example": "",
      "exampleReading": "",
      "exampleMeaning": ""
    }
  ],

  "grammar": [
    {
      "title": "",
      "level": "N5",
      "explanation": "",
      "examples": [
        {
          "sentence": "",
          "reading": "",
          "meaning": ""
        }
      ]
    }
  ],

  "kanji": [
    {
      "kanji": "",
      "meaning": "",
      "reading": "",
      "level": "N5",
      "examples": [
        {
          "sentence": "",
          "reading": "",
          "meaning": ""
        }
      ],
      "memoryTip": ""
    }
  ],

  "quiz": [
    {
      "type": "",
      "question": "",
      "kanji": "",
      "reading": "",
      "meaning": "",
      "options": ["", "", "", ""],
      "answer": ""
    }
  ]
}
`;
  }

  private extractJson(text: string): any {
    const cleaned = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('Invalid JSON format');
    }

    const jsonText = cleaned.slice(firstBrace, lastBrace + 1);
    return JSON.parse(jsonText);
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  private isValidQuizType(type: any): type is QuizType {
    return ['vocabulary', 'reading', 'kanji', 'grammar'].includes(type);
  }

  private validateQuizItems(quiz: any[]): QuizItem[] {
    const validTypes: QuizType[] = ['vocabulary', 'reading', 'kanji', 'grammar'];

    return quiz
      .filter((q) => q && typeof q === 'object')
      .map((q) => ({
        type: q.type,
        question: typeof q.question === 'string' ? q.question.trim() : '',
        kanji: typeof q.kanji === 'string' ? q.kanji.trim() : '',
        reading: typeof q.reading === 'string' ? q.reading.trim() : '',
        meaning: typeof q.meaning === 'string' ? q.meaning.trim() : '',
        options: this.toStringArray(q.options),
        answer: typeof q.answer === 'string' ? q.answer.trim() : '',
      }))
      .filter((q) => {
        if (!this.isValidQuizType(q.type)) return false;
        if (!q.question || !q.kanji || !q.reading || !q.meaning || !q.answer) return false;
        if (q.options.length !== 4) return false;
        if (new Set(q.options).size !== 4) return false;
        if (!q.options.includes(q.answer)) return false;
        return true;
      });
  }

  private validateQuizDistribution(quiz: QuizItem[]): boolean {
    const counts = {
      vocabulary: 0,
      reading: 0,
      kanji: 0,
      grammar: 0,
    };

    for (const item of quiz) {
      if (item.type in counts) {
        counts[item.type]++;
      }
    }

    return (
      counts.vocabulary >= 8 &&
      counts.reading >= 8 &&
      counts.kanji >= 7 &&
      counts.grammar >= 7 &&
      quiz.length === 30
    );
  }

  async getDailyLearning(retry = false) {
    const today = this.getTodayInIST();

    const existing = await this.prisma.dailyLearning.findUnique({
      where: { date: today },
    });

    if (existing) return existing;

    const randomSeed = Math.floor(Math.random() * 100000);

    const previousData = await this.prisma.dailyLearning.findMany({
      take: 50,
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
          if (v?.word && usedWords.size < 200) {
            usedWords.add(String(v.word));
          }
        }
      }

      const kanji = d.kanji as any[];
      if (Array.isArray(kanji)) {
        for (const k of kanji) {
          if (k?.kanji && usedKanji.size < 200) {
            usedKanji.add(String(k.kanji));
          }
        }
      }

      if (d.tip && usedTips.size < 50) {
        usedTips.add(String(d.tip));
      }
    }

    const usedWordsList = Array.from(usedWords).slice(0, 50).join(', ');
    const usedKanjiList = Array.from(usedKanji).slice(0, 50).join(', ');
    const usedTipsList = Array.from(usedTips).slice(0, 10).join(' | ');

    const prompt = this.buildPrompt(
      today,
      randomSeed,
      usedWordsList,
      usedKanjiList,
      usedTipsList,
    );

    let text: string | undefined;

    try {
      try {
        const response = await this.callDeepSeek(prompt);
        text = response.data?.choices?.[0]?.message?.content;
        console.log('✅ DeepSeek response');
      } catch {
        console.warn('⚠️ DeepSeek failed, switching to Gemini...');
        const response = await this.callGemini(prompt);
        text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log('✅ Gemini fallback');
      }

      if (!text) throw new Error('Empty AI response');

      let parsed: DailyLearningPayload;

      try {
        parsed = this.extractJson(text);
      } catch (err: any) {
        console.error('❌ PARSE ERROR:', err?.message || err);
        console.error('RAW:', text);
        throw new Error('JSON parse failed');
      }

      if (
        !parsed?.tip ||
        !Array.isArray(parsed?.vocabulary) ||
        !Array.isArray(parsed?.grammar) ||
        !Array.isArray(parsed?.kanji) ||
        !Array.isArray(parsed?.quiz)
      ) {
        throw new Error('Invalid AI structure');
      }

      parsed.vocabulary = parsed.vocabulary.filter(
        (v: any) =>
          v &&
          v.level === 'N5' &&
          typeof v.word === 'string' &&
          v.word.trim().length > 0 &&
          v.word.trim().length <= 6 &&
          typeof v.reading === 'string' &&
          typeof v.meaning === 'string' &&
          typeof v.example === 'string' &&
          typeof v.exampleReading === 'string' &&
          typeof v.exampleMeaning === 'string',
      );

      parsed.kanji = parsed.kanji.filter(
        (k: any) =>
          k &&
          k.level === 'N5' &&
          typeof k.kanji === 'string' &&
          k.kanji.trim().length > 0 &&
          typeof k.meaning === 'string' &&
          typeof k.reading === 'string' &&
          typeof k.memoryTip === 'string' &&
          Array.isArray(k.examples) &&
          k.examples.length >= 2,
      );

      parsed.grammar = parsed.grammar.filter(
        (g: any) =>
          g &&
          g.level === 'N5' &&
          typeof g.title === 'string' &&
          g.title.trim().length > 0 &&
          typeof g.explanation === 'string' &&
          Array.isArray(g.examples) &&
          g.examples.length >= 3,
      );

      parsed.quiz = this.validateQuizItems(parsed.quiz);

      parsed.vocabulary = parsed.vocabulary.filter(
        (v: any) => !usedWords.has(String(v.word)),
      );

      parsed.kanji = parsed.kanji.filter(
        (k: any) => !usedKanji.has(String(k.kanji)),
      );

      if (usedTips.has(String(parsed.tip))) {
        parsed.tip = 'Consistency is key. Keep learning every day 💪';
      }

      const isValid =
        parsed.vocabulary.length === 10 &&
        parsed.kanji.length === 10 &&
        parsed.grammar.length === 2 &&
        this.validateQuizDistribution(parsed.quiz);

      if (!isValid) {
        console.warn('⚠️ Invalid or incomplete AI content');

        if (!retry) {
          return this.getDailyLearning(true);
        }

        throw new Error('Invalid AI content after retry');
      }

 const saved = await this.prisma.dailyLearning.create({
  data: {
    date: today,
    tip: parsed.tip,
    vocabulary: parsed.vocabulary as unknown as Prisma.InputJsonValue,
    grammar: parsed.grammar as unknown as Prisma.InputJsonValue,
    kanji: parsed.kanji as unknown as Prisma.InputJsonValue,
    quiz: parsed.quiz as unknown as Prisma.InputJsonValue,
  },
});

      return saved;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('Axios:', error.response?.data);
      }

      console.error('❌ Daily Learning Error:', error?.message || error);

      if (retry) {
        throw new InternalServerErrorException(
          'Failed to generate daily learning content.',
        );
      }

      return {
        date: today,
        tip: 'Consistency beats intensity. Study a little every day! 💪',
        vocabulary: [],
        grammar: [],
        kanji: [],
        quiz: [],
      };
    }
  }
}