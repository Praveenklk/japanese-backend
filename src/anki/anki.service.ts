import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class AnkiService {
  constructor(private prisma: PrismaService) {}

  async importApkg(file: Express.Multer.File) {
    if (!file.originalname.endsWith('.apkg')) {
      throw new BadRequestException('Only .apkg files are allowed');
    }

    const tempDir = path.join(process.cwd(), 'tmp', randomUUID());
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      /* -------------------- UNZIP -------------------- */
      const zip = new AdmZip(file.buffer);
      zip.extractAllTo(tempDir, true);

      const dbPath = path.join(tempDir, 'collection.anki2');
      if (!fs.existsSync(dbPath)) {
        throw new Error('Invalid Anki deck');
      }

      const db = new Database(dbPath, { readonly: true });

      /* -------------------- DECK -------------------- */
      const deckRow = db
        .prepare(`SELECT decks FROM col`)
        .get();

      const decksJson = JSON.parse(deckRow.decks);
      const firstDeck = Object.values(decksJson)[0] as any;

      const deck = await this.prisma.ankiDeck.create({
        data: {
          ankiDeckId: String(firstDeck.id),
          name: firstDeck.name,
          noteCount: 0,
        },
      });

      /* -------------------- NOTES -------------------- */
      const notes = db
        .prepare(`SELECT id, mid, flds, tags FROM notes`)
        .all();

      let noteCount = 0;

      for (const note of notes) {
        const fields = note.flds.split('\x1f');
        const tags = note.tags ? note.tags.split(' ') : [];

        const createdNote = await this.prisma.ankiNote.create({
          data: {
            ankiNoteId: String(note.id),
            ankiModelId: String(note.mid),
            fields,
            front: fields[0] ?? null,
            back: fields[1] ?? null,
            reading: fields[2] ?? null,
            deckId: deck.id,
          },
        });

        /* -------------------- TAGS -------------------- */
        for (const tagName of tags) {
          const tag =
            await this.prisma.ankiTag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName },
            });

          await this.prisma.ankiNoteTag.create({
            data: {
              noteId: createdNote.id,
              tagId: tag.id,
            },
          });
        }

        /* -------------------- MEDIA -------------------- */
        const mediaJsonPath = path.join(tempDir, 'media.json');
        if (fs.existsSync(mediaJsonPath)) {
          const mediaMap = JSON.parse(
            fs.readFileSync(mediaJsonPath, 'utf-8'),
          );

          for (const key in mediaMap) {
            const filename = mediaMap[key];
            const filePath = path.join(tempDir, filename);

            if (!fs.existsSync(filePath)) continue;

            const type = this.detectMediaType(filename);

            await this.prisma.ankiMedia.create({
              data: {
                filename,
                url: `/media/${filename}`,
                type,
                noteId: createdNote.id,
              },
            });
          }
        }

        noteCount++;
      }

      /* -------------------- CARDS -------------------- */
      const cards = db
        .prepare(`SELECT id, nid, ord FROM cards`)
        .all();

      for (const card of cards) {
        const note = await this.prisma.ankiNote.findUnique({
          where: { ankiNoteId: String(card.nid) },
        });

        if (!note) continue;

        await this.prisma.ankiCard.create({
          data: {
            ankiCardId: String(card.id),
            ord: card.ord,
            noteId: note.id,
          },
        });
      }

      await this.prisma.ankiDeck.update({
        where: { id: deck.id },
        data: { noteCount },
      });

      db.close();

      return {
        success: true,
        deck: deck.name,
        notesImported: noteCount,
      };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /* -------------------- MEDIA TYPE -------------------- */
  private detectMediaType(filename: string) {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (['mp3', 'wav', 'ogg'].includes(ext!)) return 'AUDIO';
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext!)) return 'IMAGE';
    if (['gif'].includes(ext!)) return 'GIF';
    if (['mp4', 'webm'].includes(ext!)) return 'VIDEO';

    return 'IMAGE';
  }


  getDecks() {
    return this.prisma.ankiDeck.findMany({
      select: {
        id: true,
        name: true,
        noteCount: true,
        createdAt: true,
      },
    });
  }

  async getDeckNotes(deckId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [notes, total] = await Promise.all([
      this.prisma.ankiNote.findMany({
        where: { deckId },
        include: {
          media: true,
          tags: { include: { tag: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ankiNote.count({ where: { deckId } }),
    ]);

    return { total, page, limit, notes };
  }

  getNote(noteId: string) {
    return this.prisma.ankiNote.findUnique({
      where: { id: noteId },
      include: {
        media: true,
        tags: { include: { tag: true } },
      },
    });
  }
}
