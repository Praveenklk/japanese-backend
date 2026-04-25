// src/anki/anki.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

const MAX_APKG_SIZE_MB = 10; // Free plan limit
const MAX_TOTAL_FILES = 5000; // Zip bomb guard

@Injectable()
export class AnkiService {
  private readonly logger = new Logger(AnkiService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async importApkg(file: Express.Multer.File) {
    this.logger.log(`📦 Import started: ${file?.originalname}`);

    if (!file || !file.originalname?.endsWith('.apkg')) {
      throw new BadRequestException('Only .apkg files are allowed');
    }

    if (file.size > MAX_APKG_SIZE_MB * 1024 * 1024) {
      throw new BadRequestException(
        `Free plan: Max ${MAX_APKG_SIZE_MB}MB per upload.`,
      );
    }

    const tempDir = path.join(process.cwd(), 'tmp', randomUUID());
    fs.mkdirSync(tempDir, { recursive: true });

    let db: Database | null = null;

    try {
      /* ==================== SAFE UNZIP ==================== */
      const zip = new AdmZip(file.buffer);
      const entries = zip.getEntries();

      if (entries.length > MAX_TOTAL_FILES) {
        throw new BadRequestException(
          'Package contains too many files (possible zip bomb)',
        );
      }

      for (const entry of entries) {
        const entryPath = path.normalize(entry.entryName);
        const destPath = path.join(tempDir, entryPath);

        if (!destPath.startsWith(tempDir)) {
          throw new BadRequestException('Unsafe zip paths detected');
        }

        if (entry.isDirectory) {
          fs.mkdirSync(destPath, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, entry.getData());
        }
      }

      const dbPath = path.join(tempDir, 'collection.anki2');
      if (!fs.existsSync(dbPath)) {
        throw new BadRequestException(
          'Invalid Anki package (missing collection.anki2)',
        );
      }

      db = new Database(dbPath, { readonly: true });

      /* ==================== DECK ==================== */
      const deckRow = db.prepare(`SELECT decks FROM col`).get();
      const decks = JSON.parse(deckRow.decks || '{}');
      const deckData = Object.values(decks).find(
        (d: any) => d.name !== 'Default',
      ) as any;

      if (!deckData) throw new BadRequestException('No valid deck found');

      const existingDeck = await this.prisma.ankiDeck.findFirst({
        where: { ankiDeckId: String(deckData.id) },
      });

      if (existingDeck) {
        throw new BadRequestException(
          `Deck "${deckData.name}" already imported`,
        );
      }

      const deck = await this.prisma.ankiDeck.create({
        data: {
          ankiDeckId: String(deckData.id),
          name: deckData.name,
          noteCount: 0,
        },
      });

      /* ==================== MEDIA MAP ==================== */
      const mediaJsonPath = path.join(tempDir, 'media');
      const mediaMap: Record<string, string> = fs.existsSync(mediaJsonPath)
        ? JSON.parse(fs.readFileSync(mediaJsonPath, 'utf-8'))
        : {};

      const resolvedMedia = new Map<string, string>();

      for (const [key, realName] of Object.entries(mediaMap)) {
        const src = path.join(tempDir, key);
        if (!fs.existsSync(src)) continue;

        const buffer = fs.readFileSync(src);

        const safeName = `${randomUUID()}-${realName}`;
        const folder = `anki/${deck.name.replace(/[^\w-]/g, '_')}`;

        const url = await this.cloudinary.uploadFile(
          buffer,
          folder,
          safeName,
        );

        resolvedMedia.set(realName, url);
      }

      /* ==================== NOTES ==================== */
      const notes = db.prepare(`SELECT id, mid, flds, tags FROM notes`).all();

      let noteCount = 0;
      const soundRegex = /\[sound:(.+?)\]/g;
      const imageRegex = /<img[^>]+src="([^"]+)"/g;

      for (const note of notes) {
        const fields = note.flds?.split('\x1f') ?? [];
        const tags = note.tags ? note.tags.split(' ') : [];

        if (!fields.length) continue;

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

        noteCount++;

        for (const tagName of tags) {
          if (!tagName) continue;
          const tag = await this.prisma.ankiTag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName },
          });
          await this.prisma.ankiNoteTag.create({
            data: { noteId: createdNote.id, tagId: tag.id },
          });
        }

        let imagePath: string | null = null;
        let audioPath: string | null = null;

        for (const field of fields) {
          let match;
          while ((match = soundRegex.exec(field || ''))) {
            const filename = match[1];
            const url = resolvedMedia.get(filename);
            if (!url) continue;

            audioPath ??= url;

            await this.prisma.ankiMedia.create({
              data: { filename, url, type: 'AUDIO', noteId: createdNote.id },
            });
          }
        }

        for (const field of fields) {
          let match;
          while ((match = imageRegex.exec(field || ''))) {
            const filename = match[1];
            const url = resolvedMedia.get(filename);
            if (!url) continue;

            imagePath ??= url;

            await this.prisma.ankiMedia.create({
              data: { filename, url, type: 'IMAGE', noteId: createdNote.id },
            });
          }
        }

        const cards = db
          .prepare(`SELECT id, ord FROM cards WHERE nid = ?`)
          .all(note.id);

        for (const card of cards) {
          await this.prisma.ankiCard.upsert({
            where: { ankiCardId: String(card.id) },
            update: {},
            create: {
              ankiCardId: String(card.id),
              ord: card.ord,
              kanji: createdNote.front,
              meaning: createdNote.back,
              reading: createdNote.reading,
              imagePath,
              audioPath,
              noteId: createdNote.id,
            },
          });
        }
      }

      if (!noteCount) throw new BadRequestException('No valid notes found');

      await this.prisma.ankiDeck.update({
        where: { id: deck.id },
        data: { noteCount },
      });

      this.logger.log(
        `✅ Imported deck "${deck.name}" with ${noteCount} notes`,
      );

      return { success: true, deck: deck.name, notesImported: noteCount };
    } finally {
      if (db) {
        try {
          db.close();
        } catch {}
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /* ==================== READ ==================== */

  getDecks() {
    return this.prisma.ankiDeck.findMany({
      select: { id: true, name: true, noteCount: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDeckNotes(deckId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notes, total] = await Promise.all([
      this.prisma.ankiNote.findMany({
        where: { deckId },
        include: { media: true, tags: { include: { tag: true } } },
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
      include: { media: true, tags: { include: { tag: true } } },
    });
  }
}
