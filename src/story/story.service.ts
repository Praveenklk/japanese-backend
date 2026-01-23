import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { JLPT } from '@prisma/client';

@Injectable()
export class StoryService {
  constructor(private prisma: PrismaService) {}

  // ➕ Create story
  create(dto: CreateStoryDto) {
    return this.prisma.story.create({
      data: dto,
    });
  }

  // 📚 Get all stories
  findAll() {
    return this.prisma.story.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // 📖 Get one story
  findOne(id: string) {
    return this.prisma.story.findUnique({
      where: { id },
    });
  }

  // ✏️ Update story
  update(id: string, dto: UpdateStoryDto) {
    return this.prisma.story.update({
      where: { id },
      data: dto,
    });
  }

  // 🗑️ Delete story
  remove(id: string) {
    return this.prisma.story.delete({
      where: { id },
    });
  }

  // 🔍 Filter by level & difficulty (learning-friendly)
findByLevel(level: JLPT) {
  return this.prisma.story.findMany({
    where: { level },
  });
}
}
