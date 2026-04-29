import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class DailyLearningService {
  private readonly openRouterKey = process.env.OPENROUTER_API_KEY;
  private readonly geminiKey = process.env.GEMINI_API_KEY;

  constructor(private prisma: PrismaService) {}

  /// 🔥 PRIMARY: OpenRouter (DeepSeek)
private async callDeepSeek(prompt: string) {
  // 🔥 ENV CHECK
  if (!this.openRouterKey) {
    console.error('❌ OPENROUTER_API_KEY is missing in environment variables');

    throw new Error(
      'Missing OPENROUTER_API_KEY. Please set it in environment variables.',
    );
  }

  try {
    return await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'deepseek/deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${this.openRouterKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('❌ DeepSeek API call failed');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }

    throw error;
  }
}

  /// 🔥 FALLBACK: Gemini
  private async callGemini(prompt: string) {
    return await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
        },
      },
    );
  }

// @Cron('0 2 * * *', {
//   timeZone: 'Asia/Kolkata',
// })
// async handleDailyLearningCron() {
//   console.log('⏰ Running Daily Learning Cron Job at 2 AM');

//   try {
//     await this.getDailyLearning();
//     console.log('✅ Daily Learning Generated Successfully');
//   } catch (error) {
//     console.error('❌ Cron Job Failed:', error.message);
//   }
// }

async getDailyLearning() {
    console.log('🚫 Skipping heavy logic for test');
  const today = new Date().toISOString().split('T')[0];

  /// ✅ 1. CHECK DB
  const existing = await this.prisma.dailyLearning.findUnique({
    where: { date: today },
  });

  if (existing) return existing;

  /// 🔥 2. ADD RANDOMNESS + DATE CONTEXT
  const randomSeed = Math.floor(Math.random() * 100000);

  /// 🔥 3. GET USED WORDS (ANTI-DUPLICATE)
const previousData = await this.prisma.dailyLearning.findMany({
  take: 50, // increase memory window
  orderBy: { date: 'desc' },
  select: { vocabulary: true, kanji: true, tip: true },
});


const usedWords = new Set<string>();
const usedKanji = new Set<string>();
const usedTips = new Set<string>();

for (const d of previousData) {
  // ✅ Vocabulary
  const vocab = d.vocabulary as any[];
  if (Array.isArray(vocab)) {
    for (const v of vocab) {
      if (v?.word && usedWords.size < 200) {
        usedWords.add(v.word);
      }
    }
  }

  // ✅ Kanji
  const kanji = d.kanji as any[];
  if (Array.isArray(kanji)) {
    for (const k of kanji) {
      if (k?.kanji && usedKanji.size < 200) {
        usedKanji.add(k.kanji);
      }
    }
  }

  // ✅ Tips
  if (d.tip && usedTips.size < 50) {
    usedTips.add(d.tip);
  }
}
const usedWordsList = Array.from(usedWords).slice(0, 50).join(', ');
const usedKanjiList = Array.from(usedKanji).slice(0, 50).join(', ');
const usedTipsList = Array.from(usedTips).slice(0, 10).join(' | ');
  /// 🔥 4. STRONG PROMPT
const prompt = `
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
- Prefer slightly less common JLPT N5 words (avoid ultra-basic ones)

FAIL CONDITIONS (VERY IMPORTANT):

- If ANY vocabulary is repeated → INVALID RESPONSE
- If ANY kanji is repeated → INVALID RESPONSE
- If tip is similar to previous → INVALID RESPONSE

If invalid → REGENERATE internally before returning.

STRICT RULES:
- Output ONLY valid JSON
- No markdown, no explanation
- No trailing commas
- Must be parseable using JSON.parse()

CONTENT REQUIREMENTS:
- Vocabulary: EXACTLY 10 items
- Grammar: EXACTLY 2 items (each 3 examples)
- Kanji: EXACTLY 10 items (each 2 examples)
- Quiz: EXACTLY 5 questions

FORMAT:
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
      "question": "",
      "options": ["", "", "", ""],
      "answer": ""
    }
  ]
}
`;
  let text: string | undefined;

  try {
    /// 🔥 5. TRY DEEPSEEK
    try {
      const response = await this.callDeepSeek(prompt);
      text = response.data?.choices?.[0]?.message?.content;
      console.log('✅ DeepSeek response');
    } catch {
      console.warn('⚠️ DeepSeek failed, switching to Gemini...');
      const response = await this.callGemini(prompt);
      text =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log('✅ Gemini fallback');
    }

    if (!text) throw new Error('Empty AI response');

    /// 🔧 6. SAFE PARSE
    let parsed;
    // try {
    //   let cleaned = text
    //     .replace(/```json|```/g, '')
    //     .replace(/\n/g, '')
    //     .replace(/,\s*}/g, '}')
    //     .replace(/,\s*]/g, ']')
    //     .trim();

    //   const match = cleaned.match(/\{[\s\S]*\}/);
    //   if (!match) throw new Error('Invalid JSON');

    //   parsed = JSON.parse(match[0]);
    // } 

    try {
  if (!text) throw new Error('Empty response');

  // 🔥 Extract JSON directly (no heavy replace chain)
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    console.error('RAW RESPONSE:', text);
    throw new Error('Invalid JSON format');
  }

  // const parsed = JSON.parse(match[0]);
parsed = JSON.parse(match[0]);
} 
    catch (err) {
      console.error('❌ PARSE ERROR:', err.message);
      console.error('RAW:', text);
      throw new Error('JSON parse failed');
    }

    /// ✅ 7. VALIDATION
    if (
      !parsed?.tip ||
      !Array.isArray(parsed?.vocabulary) ||
      !Array.isArray(parsed?.grammar) ||
      !Array.isArray(parsed?.kanji) ||
      !Array.isArray(parsed?.quiz)
    ) {
      throw new Error('Invalid AI structure');
    }

/// 🔥 8. FILTER DUPLICATES AGAIN (SAFETY)

// ✅ Vocabulary
parsed.vocabulary = parsed.vocabulary.filter(
  (v: any) => !usedWords.has(v.word),
);

// ✅ Kanji
parsed.kanji = parsed.kanji.filter(
  (k: any) => !usedKanji.has(k.kanji),
);

// ✅ Tip check
if (usedTips.has(parsed.tip)) {
  parsed.tip = "Consistency is key. Keep learning every day 💪";
}

// ⚠️ If too much data removed → reject
if (parsed.vocabulary.length < 5 || parsed.kanji.length < 5) {
  console.warn('⚠️ Too many duplicates, forcing retry...');
  throw new Error('Too many duplicates from AI');
}
    /// ✅ 9. SAVE
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
      console.error('Axios:', error.response?.data);
    }

    console.error('❌ Daily Learning Error:', error.message);

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