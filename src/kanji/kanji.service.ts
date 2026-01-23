import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKanjiDto } from './dto/create-kanji.dto';
import { UpdateKanjiDto } from './dto/update-kanji.dto';

@Injectable()
export class KanjiService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateKanjiDto) {
    return this.prisma.kanji.create({
      data: {
        character: dto.character,
        meaning: dto.meaning,
        onyomi: dto.onyomi,
        kunyomi: dto.kunyomi,
        strokes: dto.strokes,
        radicals: dto.radicals,
        jlptLevel: dto.jlptLevel,
        explanation: dto.explanation,
        memoryStory: dto.memoryStory,
        aiHint: dto.aiHint,
        status: dto.status,
        words: dto.words
          ? { create: dto.words }
          : undefined,
        sentences: dto.sentences
          ? { create: dto.sentences }
          : undefined,
      },
      include: {
        words: true,
        sentences: true,
      },
    });
  }

  async findAll() {
    return this.prisma.kanji.findMany({
      include: {
        words: true,
        sentences: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const kanji = await this.prisma.kanji.findUnique({
      where: { id },
      include: {
        words: true,
        sentences: true,
      },
    });

    if (!kanji) {
      throw new NotFoundException('Kanji not found');
    }

    return kanji;
  }

async update(id: string, dto: UpdateKanjiDto) {
  await this.findOne(id);

  const {
    words,
    sentences,
    ...kanjiData
  } = dto;

  return this.prisma.kanji.update({
    where: { id },
    data: {
      ...kanjiData,

      ...(words && {
        words: {
          deleteMany: {}, // remove old words
          create: words,  // add new ones
        },
      }),

      ...(sentences && {
        sentences: {
          deleteMany: {},   // remove old sentences
          create: sentences,
        },
      }),
    },
    include: {
      words: true,
      sentences: true,
    },
  });
}


  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.kanji.delete({
      where: { id },
    });
  }
}
