import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { KanjiService } from './kanji.service';
import { CreateKanjiDto } from './dto/create-kanji.dto';
import { UpdateKanjiDto } from './dto/update-kanji.dto';

@Controller('kanji')
export class KanjiController {
  constructor(private readonly kanjiService: KanjiService) {}

  @Post()
  create(@Body() dto: CreateKanjiDto) {
    return this.kanjiService.create(dto);
  }

  @Get()
  findAll() {
    return this.kanjiService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.kanjiService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKanjiDto,
  ) {
    return this.kanjiService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.kanjiService.remove(id);
  }
}
