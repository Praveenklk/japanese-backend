import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HiraganaService } from './hiragana.service';
import { CreateHiraganaDto } from './dto/create-hiragana.dto';
import { UpdateHiraganaDto } from './dto/update-hiragana.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateManyHiraganaDto } from './dto/create-many-hiragana.dto';
import { UpdateReadStatusDto } from './dto/update-read-status.dto';

@Controller('hiragana')
export class HiraganaController {
  constructor(
    private readonly hiraganaService: HiraganaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // CREATE (image OPTIONAL)
// CREATE
@Post()
@UseInterceptors(FileInterceptor('image'))
async create(
  @Body() dto: CreateHiraganaDto,
  @UploadedFile() file?: Express.Multer.File,
) {
  let imageUrl: string | undefined;

  if (file) {
    imageUrl = await this.cloudinaryService.uploadImage(
      file.buffer,
      'hiragana',
    );
  }

  return this.hiraganaService.create(dto, imageUrl);
}

  // READ ALL
  @Get()
  findAll() {
    return this.hiraganaService.findAll();
  }

  @Patch(':id/read-status')
updateReadStatus(
  @Param('id') id: string,
  @Body() dto: UpdateReadStatusDto,
) {
  return this.hiraganaService.updateReadStatus(id, dto.isRead);
}

  // READ ONE
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hiraganaService.findOne(id);
  }

  // UPDATE (already optional – good)
  @Patch(':id')
@Patch(':id')
@UseInterceptors(FileInterceptor('image'))
async update(
  @Param('id') id: string,
  @Body() dto: UpdateHiraganaDto,
  @UploadedFile() file?: Express.Multer.File,
) {
  let imageUrl: string | undefined;

  if (file) {
    imageUrl = await this.cloudinaryService.uploadImage(
      file.buffer,
      'hiragana',
    );
  }

  return this.hiraganaService.update(id, dto, imageUrl);
}

@Post('bulk')
createMany(@Body() body: any) {
  console.log('RAW BODY:', body);
  console.log('IS ARRAY:', Array.isArray(body));
  return this.hiraganaService.createMany(body);
}



  // DELETE
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.hiraganaService.remove(id);
  }
}
