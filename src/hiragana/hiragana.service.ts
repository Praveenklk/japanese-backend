import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHiraganaDto } from './dto/create-hiragana.dto';
import { UpdateHiraganaDto } from './dto/update-hiragana.dto';

@Injectable()
export class HiraganaService {
  constructor(private readonly prisma: PrismaService) {}

  // CREATE
async create(dto: CreateHiraganaDto, imageUrl?: string) {
  try {
    const data: any = {
      symbol: dto.symbol,
      romaji: dto.romaji,
      explanation: dto.explanation,
      example: dto.example,
    };

    if (imageUrl) {
      data.imageUrl = imageUrl;
    }

    if (dto.audioUrl) {
      data.audioUrl = dto.audioUrl;
    }

    return await this.prisma.hiragana.create({ data });
  } catch (error) {
    throw new BadRequestException('Failed to create Hiragana');
  }
}


  // READ ALL
  async findAll() {
    return this.prisma.hiragana.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // READ ONE
  async findOne(id: string) {
    const hiragana = await this.prisma.hiragana.findUnique({
      where: { id },
    });

    if (!hiragana) {
      throw new NotFoundException('Hiragana not found');
    }

    return hiragana;
  }


  async updateReadStatus(id: string, isRead: boolean) {
  await this.findOne(id); // reuse existing method

  return this.prisma.hiragana.update({
    where: { id },
    data: { isRead },
  });
}


  // CREATE MANY
async createMany(dtos: CreateHiraganaDto[]) {
  try {
    console.log('Creating Hiragana with data:', dtos); // Add logging
    
    const data = dtos.map((dto) => {
      const item: any = {
        symbol: dto.symbol,
        romaji: dto.romaji,
        explanation: dto.explanation,
        example: dto.example,
      };

      if (dto.imageBase64) {
        item.imageBase64 = dto.imageBase64;
      }

      if (dto.audioUrl) {
        item.audioUrl = dto.audioUrl;
      }

      return item;
    });

    const result = await this.prisma.hiragana.createMany({
      data,
      skipDuplicates: true,
    });
    
    console.log(`Created ${result.count} Hiragana characters`);
    return result;
    
  } catch (error) {
    console.error('Error creating Hiragana:', error); // Log the actual error
    throw new BadRequestException(`Failed to create many Hiragana: ${error.message}`);
  }
}


  // UPDATE
  async update(
    id: string,
    dto: UpdateHiraganaDto,
    imageUrl?: string,
  ) {
    await this.findOne(id);

    return this.prisma.hiragana.update({
      where: { id },
      data: {
        symbol: dto.symbol,
        romaji: dto.romaji,
        explanation: dto.explanation,
        example: dto.example,
        audioUrl: dto.audioUrl,
        imageUrl: imageUrl ?? undefined,
      },
    });
  }

  // DELETE
  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.hiragana.delete({
      where: { id },
    });

    return { message: 'Hiragana deleted successfully' };
  }
}
