import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKatakanaDto } from './dto/create-katakana.dto';
import { UpdateKatakanaDto } from './dto/update-katakana.dto';

@Injectable()
export class KatakanaService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateKatakanaDto) {
    return this.prisma.katakana.create({
      data: dto,
    });
  }

  createMany(data: CreateKatakanaDto[]) {
  return this.prisma.katakana.createMany({
    data,
    skipDuplicates: true, // optional but recommended
  });
}


  findAll() {
    return this.prisma.katakana.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const katakana = await this.prisma.katakana.findUnique({ where: { id } });
    if (!katakana) throw new NotFoundException('Katakana not found');
    return katakana;
  }

  async update(id: string, dto: UpdateKatakanaDto) {
    await this.findOne(id);
    return this.prisma.katakana.update({
      where: { id },
      data: dto,
    });
  }

  async markAsRead(id: string) {
    await this.findOne(id);
    return this.prisma.katakana.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.katakana.delete({
      where: { id },
    });
  }
}
