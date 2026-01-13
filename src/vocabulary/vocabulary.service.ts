import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVocabularyDto } from './dto/create-vocabulary.dto';
import { UpdateVocabularyDto } from './dto/update-vocabulary.dto';

@Injectable()
export class VocabularyService {
  constructor(private prisma: PrismaService) {}

  // Create single vocab
  create(dto: CreateVocabularyDto) {
    return this.prisma.vocabulary.create({
      data: {
        ...dto,
        nextReviewAt: new Date(),
      },
    });
  }

  // Bulk create
async bulkCreate(items: CreateVocabularyDto[]) {
  if (!items || items.length === 0) {
    throw new Error('Bulk create failed: items array is empty or missing');
  }

  return this.prisma.vocabulary.createMany({
    data: items.map((item) => ({
      ...item,
      nextReviewAt: new Date(),
    })),
  });
}

  // Get all
  findAll() {
    return this.prisma.vocabulary.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // Due flashcards (Anki behavior)
  findDueCards() {
    return this.prisma.vocabulary.findMany({
      where: {
        nextReviewAt: {
          lte: new Date(),
        },
      },
      orderBy: {
        nextReviewAt: 'asc',
      },
    });
  }

  // Review logic (Again / Good / Easy)
  async review(id: string, rating: 'again' | 'good' | 'easy') {
    const vocab = await this.prisma.vocabulary.findUnique({
      where: { id },
    });

    if (!vocab) throw new NotFoundException('Vocabulary not found');

    let nextInterval = 1;

    if (rating === 'good') {
      nextInterval = vocab.intervalDays * 2;
    } else if (rating === 'easy') {
      nextInterval = vocab.intervalDays * 3;
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + nextInterval);

    return this.prisma.vocabulary.update({
      where: { id },
      data: {
        intervalDays: nextInterval,
        lastReviewedAt: new Date(),
        nextReviewAt: nextReviewDate,
        reviews: { increment: 1 },
        correctCount:
          rating !== 'again'
            ? { increment: 1 }
            : undefined,
        incorrectCount:
          rating === 'again'
            ? { increment: 1 }
            : undefined,
      },
    });
  }


  // Update vocabulary
async update(id: string, dto: UpdateVocabularyDto) {
  return this.prisma.vocabulary.update({
    where: { id },
    data: {
      ...dto,
      nextReviewAt: dto.nextReviewAt
        ? new Date(dto.nextReviewAt)
        : undefined,
    },
  });
}

// Delete vocabulary
async remove(id: string) {
  return this.prisma.vocabulary.delete({
    where: { id },
  });
}

}
