import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { KatakanaService } from './katakana.service';
import { CreateKatakanaDto } from './dto/create-katakana.dto';
import { UpdateKatakanaDto } from './dto/update-katakana.dto';
import { CreateManyKatakanaDto } from './dto/create-many-katakana.dto';

@Controller('katakana')
export class KatakanaController {
  constructor(private readonly katakanaService: KatakanaService) {}

  @Post()
  create(@Body() dto: CreateKatakanaDto) {
    return this.katakanaService.create(dto);
  }

@Post('bulk')
createMany(@Body() data: CreateKatakanaDto[]) {
  return this.katakanaService.createMany(data);
}


  
  

  @Get()
  findAll() {
    return this.katakanaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.katakanaService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKatakanaDto,
  ) {
    return this.katakanaService.update(id, dto);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.katakanaService.markAsRead(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.katakanaService.remove(id);
  }
}
