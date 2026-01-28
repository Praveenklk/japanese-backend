-- AlterTable
ALTER TABLE "AnkiCard" ADD COLUMN     "audioPath" TEXT,
ADD COLUMN     "imagePath" TEXT,
ADD COLUMN     "kanji" TEXT,
ADD COLUMN     "meaning" TEXT,
ADD COLUMN     "reading" TEXT;

-- CreateIndex
CREATE INDEX "AnkiCard_noteId_idx" ON "AnkiCard"("noteId");
