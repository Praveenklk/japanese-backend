import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { VocabularyService } from './vocabulary.service';
import { CreateVocabularyDto } from './dto/create-vocabulary.dto';
import { BulkCreateVocabularyDto } from './dto/bulk-create-vocabulary.dto';
import { ReviewVocabularyDto } from './dto/review-vocabulary.dto';
import { UpdateVocabularyDto } from './dto/update-vocabulary.dto';

@Controller('vocabulary')
export class VocabularyController {
  constructor(private readonly service: VocabularyService) {}

  // Create one
  @Post()
  create(@Body() dto: CreateVocabularyDto) {
    return this.service.create(dto);
  }

  // Bulk create
@Post('bulk')
bulkCreate(@Body() body: any) {
  const items = Array.isArray(body) ? body : body.items;
  return this.service.bulkCreate(items);
}



  // Get all
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // Get due flashcards
  @Get('due')
  findDue() {
    return this.service.findDueCards();
  }

  // Review card (Again / Good / Easy)
  @Post(':id/review')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewVocabularyDto,
  ) {
    return this.service.review(id, dto.rating);
  }

  // Update
@Patch(':id')
update(
  @Param('id') id: string,
  @Body() dto: UpdateVocabularyDto,
) {
  return this.service.update(id, dto);
}

// Delete
@Delete(':id')
remove(@Param('id') id: string) {
  return this.service.remove(id);
}
}
