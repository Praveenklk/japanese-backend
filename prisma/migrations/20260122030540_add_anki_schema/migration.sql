-- CreateEnum
CREATE TYPE "AnkiMediaType" AS ENUM ('IMAGE', 'AUDIO', 'GIF', 'VIDEO');

-- CreateTable
CREATE TABLE "AnkiDeck" (
    "id" TEXT NOT NULL,
    "ankiDeckId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "noteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnkiDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnkiNote" (
    "id" TEXT NOT NULL,
    "ankiNoteId" TEXT NOT NULL,
    "ankiModelId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "front" TEXT,
    "back" TEXT,
    "reading" TEXT,
    "deckId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnkiNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnkiCard" (
    "id" TEXT NOT NULL,
    "ankiCardId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "noteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnkiCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnkiMedia" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "AnkiMediaType" NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "noteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnkiMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnkiTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AnkiTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnkiNoteTag" (
    "noteId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "AnkiNoteTag_pkey" PRIMARY KEY ("noteId","tagId")
);

-- CreateIndex
CREATE INDEX "AnkiDeck_ankiDeckId_idx" ON "AnkiDeck"("ankiDeckId");

-- CreateIndex
CREATE UNIQUE INDEX "AnkiNote_ankiNoteId_key" ON "AnkiNote"("ankiNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "AnkiCard_ankiCardId_key" ON "AnkiCard"("ankiCardId");

-- CreateIndex
CREATE INDEX "AnkiMedia_type_idx" ON "AnkiMedia"("type");

-- CreateIndex
CREATE UNIQUE INDEX "AnkiTag_name_key" ON "AnkiTag"("name");

-- AddForeignKey
ALTER TABLE "AnkiNote" ADD CONSTRAINT "AnkiNote_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "AnkiDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnkiCard" ADD CONSTRAINT "AnkiCard_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AnkiNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnkiMedia" ADD CONSTRAINT "AnkiMedia_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AnkiNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnkiNoteTag" ADD CONSTRAINT "AnkiNoteTag_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AnkiNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnkiNoteTag" ADD CONSTRAINT "AnkiNoteTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "AnkiTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
