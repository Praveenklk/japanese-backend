-- CreateEnum
CREATE TYPE "KanjiStatus" AS ENUM ('NEW', 'LEARNING', 'MASTERED');

-- CreateTable
CREATE TABLE "Kanji" (
    "id" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "onyomi" TEXT[],
    "kunyomi" TEXT[],
    "strokes" INTEGER NOT NULL,
    "radicals" TEXT[],
    "jlptLevel" "JLPT" NOT NULL DEFAULT 'N5',
    "explanation" TEXT,
    "memoryStory" TEXT,
    "aiHint" TEXT,
    "status" "KanjiStatus" NOT NULL DEFAULT 'NEW',
    "isBookmarked" BOOLEAN NOT NULL DEFAULT false,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "incorrectCount" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "intervalDays" INTEGER NOT NULL DEFAULT 1,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "strokeOrderSvg" TEXT,
    "strokeOrderGif" TEXT,
    "frequencyRank" INTEGER,
    "gradeLevel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kanji_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanjiWord" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "reading" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "kanjiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanjiWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanjiSentence" (
    "id" TEXT NOT NULL,
    "sentence" TEXT NOT NULL,
    "reading" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "kanjiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanjiSentence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kanji_character_key" ON "Kanji"("character");

-- CreateIndex
CREATE INDEX "Kanji_jlptLevel_idx" ON "Kanji"("jlptLevel");

-- CreateIndex
CREATE INDEX "Kanji_nextReviewAt_idx" ON "Kanji"("nextReviewAt");

-- CreateIndex
CREATE INDEX "Kanji_frequencyRank_idx" ON "Kanji"("frequencyRank");

-- CreateIndex
CREATE INDEX "KanjiWord_kanjiId_idx" ON "KanjiWord"("kanjiId");

-- CreateIndex
CREATE INDEX "KanjiSentence_kanjiId_idx" ON "KanjiSentence"("kanjiId");

-- AddForeignKey
ALTER TABLE "KanjiWord" ADD CONSTRAINT "KanjiWord_kanjiId_fkey" FOREIGN KEY ("kanjiId") REFERENCES "Kanji"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanjiSentence" ADD CONSTRAINT "KanjiSentence_kanjiId_fkey" FOREIGN KEY ("kanjiId") REFERENCES "Kanji"("id") ON DELETE CASCADE ON UPDATE CASCADE;
