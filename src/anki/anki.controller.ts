import {
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Param, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AnkiService } from './anki.service';

@Controller('anki')
export class AnkiController {
  constructor(private readonly ankiService: AnkiService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importDeck(@UploadedFile() file: Express.Multer.File) {
    return this.ankiService.importApkg(file);
  }


  
  // List all decks
  @Get('decks')
  getDecks() {
    return this.ankiService.getDecks();
  }

  // Notes inside a deck (pagination)
  @Get('decks/:deckId/notes')
  getDeckNotes(
    @Param('deckId') deckId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.ankiService.getDeckNotes(deckId, +page, +limit);
  }

  // Single note
  @Get('notes/:noteId')
  getNote(@Param('noteId') noteId: string) {
    return this.ankiService.getNote(noteId);
  }
}
