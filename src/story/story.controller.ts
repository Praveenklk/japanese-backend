import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { StoryService } from './story.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { JLPT } from '@prisma/client';

@Controller('stories')
export class StoryController {
  constructor(private readonly storyService: StoryService) {}


    // 📚 All stories
  @Get()
  findAll() {
    return this.storyService.findAll();
  }

  // ➕ Create
  @Post()
  create(@Body() dto: CreateStoryDto) {
    return this.storyService.create(dto);
  }


  // 📖 Single story
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storyService.findOne(id);
  }

  // 🎓 Stories by JLPT level
@Get('level/:level')
findByLevel(@Param('level') level: JLPT) {
  return this.storyService.findByLevel(level);
}

  // ✏️ Update
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStoryDto) {
    return this.storyService.update(id, dto);
  }

  // 🗑️ Delete
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.storyService.remove(id);
  }
}
