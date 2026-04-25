import { Controller, Get } from '@nestjs/common';
import { DailyLearningService } from './daily-tip.service';

@Controller('daily-learning')
export class DailyLearningController {
  constructor(private readonly service: DailyLearningService) {}

  /// 🔥 FULL DATA
  @Get()
  getAll() {
    return this.service.getDailyLearning();
  }

  /// 💡 TIP ONLY
  @Get('tip')
  async getTip() {
    const data = await this.service.getDailyLearning();
    return { tip: data.tip };
  }

  /// 📘 VOCABULARY ONLY
  @Get('vocabulary')
  async getVocabulary() {
    const data = await this.service.getDailyLearning();
    return { vocabulary: data.vocabulary };
  }

  /// 📖 GRAMMAR ONLY
  @Get('grammar')
  async getGrammar() {
    const data = await this.service.getDailyLearning();
    return { grammar: data.grammar };
  }

  /// 🧠 QUIZ ONLY
@Get('quiz')
async getQuiz() {
  const data = await this.service.getDailyLearning();

  const response = {
    tip: data.tip,
    vocabulary: data.vocabulary,
    grammar: data.grammar,
    kanji: data.kanji,
    quiz: data.quiz,
  };

  /// 🔥 DEBUG LOG
  console.log('🔥 DAILY LEARNING RESPONSE:', JSON.stringify(response, null, 2));

  return response;
}
  /// 🈶 KANJI ONLY
  @Get('kanji')
  async getKanji() {
    const data = await this.service.getDailyLearning();
    return { kanji: data.kanji };
  }
}