// import { Injectable, BadRequestException } from '@nestjs/common';
// import * as fs from 'fs';
// import * as path from 'path';
// import AdmZip from 'adm-zip';
// import Database from 'better-sqlite3';
// import { PrismaService } from '../prisma/prisma.service';
// import { randomUUID } from 'crypto';

// @Injectable()
// export class AnkiService {
//   constructor(private prisma: PrismaService) {}

//   async importApkg(file: Express.Multer.File) {
//     console.log('📦 Import started:', file.originalname);

//     if (!file.originalname.endsWith('.apkg')) {
//       throw new BadRequestException('Only .apkg files are allowed');
//     }

//     const tempDir = path.join(process.cwd(), 'tmp', randomUUID());
//     fs.mkdirSync(tempDir, { recursive: true });

//     const mediaOutputDir = path.join(
//       process.cwd(),
//       'uploads',
//       'anki-media',
//     );
//     fs.mkdirSync(mediaOutputDir, { recursive: true });

//     let db: Database | null = null;

//     try {
//       /* ==================== UNZIP ==================== */
//       const zip = new AdmZip(file.buffer);
//       zip.extractAllTo(tempDir, true);

//       const dbPath = path.join(tempDir, 'collection.anki2');
//       if (!fs.existsSync(dbPath)) {
//         throw new BadRequestException('Invalid Anki package');
//       }

//       db = new Database(dbPath, { readonly: true });

//       /* ==================== DECK ==================== */
//       const deckRow = db.prepare(`SELECT decks FROM col`).get();
//       const decks = JSON.parse(deckRow.decks);
//       const deckData = Object.values(decks).find(
//         (d: any) => d.name !== 'Default',
//       ) as any;

//       if (!deckData) {
//         throw new BadRequestException('No valid deck found');
//       }

//       const existingDeck = await this.prisma.ankiDeck.findFirst({
//         where: { ankiDeckId: String(deckData.id) },
//       });

//       if (existingDeck) {
//         throw new BadRequestException(
//           `Deck "${deckData.name}" already imported`,
//         );
//       }

//       const deck = await this.prisma.ankiDeck.create({
//         data: {
//           ankiDeckId: String(deckData.id),
//           name: deckData.name,
//           noteCount: 0,
//         },
//       });

//       /* ==================== MEDIA MAP ==================== */
//       const mediaJsonPath = path.join(tempDir, 'media');
//       const mediaMap: Record<string, string> = fs.existsSync(mediaJsonPath)
//         ? JSON.parse(fs.readFileSync(mediaJsonPath, 'utf-8'))
//         : {};

//       const resolvedMedia = new Map<string, string>();

//       for (const [key, realName] of Object.entries(mediaMap)) {
//         const src = path.join(tempDir, key);
//         const dest = path.join(mediaOutputDir, realName);

//         if (!fs.existsSync(src)) continue;

//         fs.copyFileSync(src, dest);
//         resolvedMedia.set(realName, `/media/${realName}`);

//         console.log(`📁 Media copied: ${key} → ${realName}`);
//       }

//       /* ==================== NOTES ==================== */
//       const notes = db
//         .prepare(`SELECT id, mid, flds, tags FROM notes`)
//         .all();

//       let noteCount = 0;
//       const soundRegex = /\[sound:(.+?)\]/g;
//       const imageRegex = /<img[^>]+src="([^"]+)"/g;

//       for (const note of notes) {
//         const fields = note.flds.split('\x1f');
//         const tags = note.tags ? note.tags.split(' ') : [];

//         if (
//           fields[0]?.includes('Please update to the latest Anki version')
//         ) {
//           continue;
//         }

//         const createdNote = await this.prisma.ankiNote.create({
//           data: {
//             ankiNoteId: String(note.id),
//             ankiModelId: String(note.mid),
//             fields,
//             front: fields[0] ?? null,
//             back: fields[1] ?? null,
//             reading: fields[2] ?? null,
//             deckId: deck.id,
//           },
//         });

//         noteCount++;

//         /* ---------- TAGS ---------- */
//         for (const tagName of tags) {
//           if (!tagName) continue;

//           const tag = await this.prisma.ankiTag.upsert({
//             where: { name: tagName },
//             update: {},
//             create: { name: tagName },
//           });

//           await this.prisma.ankiNoteTag.create({
//             data: {
//               noteId: createdNote.id,
//               tagId: tag.id,
//             },
//           });
//         }

//         /* ---------- AUDIO ---------- */
//         for (const field of fields) {
//           let match;
//           while ((match = soundRegex.exec(field))) {
//             const filename = match[1];
//             if (!resolvedMedia.has(filename)) continue;

//             await this.prisma.ankiMedia.create({
//               data: {
//                 filename,
//                 url: resolvedMedia.get(filename)!,
//                 type: 'AUDIO',
//                 noteId: createdNote.id,
//               },
//             });
//           }
//         }

//         /* ---------- IMAGES ---------- */
//         for (const field of fields) {
//           let match;
//           while ((match = imageRegex.exec(field))) {
//             const filename = match[1];
//             if (!resolvedMedia.has(filename)) continue;

//             await this.prisma.ankiMedia.create({
//               data: {
//                 filename,
//                 url: resolvedMedia.get(filename)!,
//                 type: 'IMAGE',
//                 noteId: createdNote.id,
//               },
//             });
//           }
//         }
//       }

//       if (noteCount === 0) {
//         throw new BadRequestException('No valid notes found');
//       }

//       /* ==================== CARDS ==================== */
//       const cards = db
//         .prepare(`SELECT id, nid, ord FROM cards`)
//         .all();

//       for (const card of cards) {
//         const note = await this.prisma.ankiNote.findUnique({
//           where: { ankiNoteId: String(card.nid) },
//         });

//         if (!note) continue;

//         await this.prisma.ankiCard.upsert({
//           where: { ankiCardId: String(card.id) },
//           update: {},
//           create: {
//             ankiCardId: String(card.id),
//             ord: card.ord,
//             noteId: note.id,
//           },
//         });
//       }

//       await this.prisma.ankiDeck.update({
//         where: { id: deck.id },
//         data: { noteCount },
//       });

//       db.close();
//       db = null;

//       return {
//         success: true,
//         deck: deck.name,
//         notesImported: noteCount,
//       };
//     } finally {
//       if (db) {
//         try {
//           db.close();
//         } catch {}
//       }
//       fs.rmSync(tempDir, { recursive: true, force: true });
//     }
//   }

//   /* ==================== READ ==================== */

//   getDecks() {
//     return this.prisma.ankiDeck.findMany({
//       select: {
//         id: true,
//         name: true,
//         noteCount: true,
//         createdAt: true,
//       },
//     });
//   }

//   async getDeckNotes(deckId: string, page: number, limit: number) {
//     const skip = (page - 1) * limit;

//     const [notes, total] = await Promise.all([
//       this.prisma.ankiNote.findMany({
//         where: { deckId },
//         include: {
//           media: true,
//           tags: { include: { tag: true } },
//         },
//         skip,
//         take: limit,
//         orderBy: { createdAt: 'desc' },
//       }),
//       this.prisma.ankiNote.count({ where: { deckId } }),
//     ]);

//     return { total, page, limit, notes };
//   }

//   getNote(noteId: string) {
//     return this.prisma.ankiNote.findUnique({
//       where: { id: noteId },
//       include: {
//         media: true,
//         tags: { include: { tag: true } },
//       },
//     });
//   }
// }





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
    console.log('📦 Import started:', file.originalname);

    if (!file.originalname.endsWith('.apkg')) {
      throw new BadRequestException('Only .apkg files are allowed');
    }

    const tempDir = path.join(process.cwd(), 'tmp', randomUUID());
    fs.mkdirSync(tempDir, { recursive: true });

    const mediaOutputDir = path.join(
      process.cwd(),
      'uploads',
      'anki-media',
    );
    fs.mkdirSync(mediaOutputDir, { recursive: true });

    let db: Database | null = null;

    try {
      /* ==================== UNZIP ==================== */
      const zip = new AdmZip(file.buffer);
      zip.extractAllTo(tempDir, true);

      const dbPath = path.join(tempDir, 'collection.anki2');
      if (!fs.existsSync(dbPath)) {
        throw new BadRequestException('Invalid Anki package');
      }

      db = new Database(dbPath, { readonly: true });

      /* ==================== DECK ==================== */
      const deckRow = db.prepare(`SELECT decks FROM col`).get();
      const decks = JSON.parse(deckRow.decks);
      const deckData = Object.values(decks).find(
        (d: any) => d.name !== 'Default',
      ) as any;

      if (!deckData) {
        throw new BadRequestException('No valid deck found');
      }

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
        const dest = path.join(mediaOutputDir, realName);

        if (!fs.existsSync(src)) continue;

        fs.copyFileSync(src, dest);
        resolvedMedia.set(realName, `/media/${realName}`);
      }

      /* ==================== NOTES ==================== */
      const notes = db
        .prepare(`SELECT id, mid, flds, tags FROM notes`)
        .all();

      let noteCount = 0;
      const soundRegex = /\[sound:(.+?)\]/g;
      const imageRegex = /<img[^>]+src="([^"]+)"/g;

      for (const note of notes) {
        const fields = note.flds.split('\x1f');
        const tags = note.tags ? note.tags.split(' ') : [];

        if (fields[0]?.includes('Please update to the latest Anki version')) {
          continue;
        }

        const createdNote = await this.prisma.ankiNote.create({
          data: {
            ankiNoteId: String(note.id),
            ankiModelId: String(note.mid),
            fields,
            front: fields[0] ?? null,   // kanji
            back: fields[1] ?? null,    // meaning
            reading: fields[2] ?? null, // reading
            deckId: deck.id,
          },
        });

        noteCount++;

        /* ---------- TAGS ---------- */
        for (const tagName of tags) {
          if (!tagName) continue;

          const tag = await this.prisma.ankiTag.upsert({
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

        let imagePath: string | null = null;
        let audioPath: string | null = null;

        /* ---------- AUDIO ---------- */
        for (const field of fields) {
          let match;
          while ((match = soundRegex.exec(field))) {
            const filename = match[1];
            if (!resolvedMedia.has(filename)) continue;

            const url = resolvedMedia.get(filename)!;
            audioPath ??= url;

            await this.prisma.ankiMedia.create({
              data: {
                filename,
                url,
                type: 'AUDIO',
                noteId: createdNote.id,
              },
            });
          }
        }

        /* ---------- IMAGES ---------- */
        for (const field of fields) {
          let match;
          while ((match = imageRegex.exec(field))) {
            const filename = match[1];
            if (!resolvedMedia.has(filename)) continue;

            const url = resolvedMedia.get(filename)!;
            imagePath ??= url;

            await this.prisma.ankiMedia.create({
              data: {
                filename,
                url,
                type: 'IMAGE',
                noteId: createdNote.id,
              },
            });
          }
        }

        /* ---------- CARDS ---------- */
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

              // 🔤 learning-ready fields
              kanji: createdNote.front,
              meaning: createdNote.back,
              reading: createdNote.reading,

              // 🖼️ media paths
              imagePath,
              audioPath,

              noteId: createdNote.id,
            },
          });
        }
      }

      if (noteCount === 0) {
        throw new BadRequestException('No valid notes found');
      }

      await this.prisma.ankiDeck.update({
        where: { id: deck.id },
        data: { noteCount },
      });

      db.close();
      db = null;

      return {
        success: true,
        deck: deck.name,
        notesImported: noteCount,
      };
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
