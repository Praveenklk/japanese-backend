/*
  Warnings:

  - You are about to drop the column `explanation` on the `Vocabulary` table. All the data in the column will be lost.
  - You are about to drop the column `isRead` on the `Vocabulary` table. All the data in the column will be lost.
  - You are about to drop the column `level` on the `Vocabulary` table. All the data in the column will be lost.
  - You are about to drop the column `meaning` on the `Vocabulary` table. All the data in the column will be lost.
  - You are about to drop the column `word` on the `Vocabulary` table. All the data in the column will be lost.
  - Added the required column `category` to the `Vocabulary` table without a default value. This is not possible if the table is not empty.
  - Added the required column `english` to the `Vocabulary` table without a default value. This is not possible if the table is not empty.
  - Added the required column `exampleEnglish` to the `Vocabulary` table without a default value. This is not possible if the table is not empty.
  - Added the required column `exampleReading` to the `Vocabulary` table without a default value. This is not possible if the table is not empty.
  - Added the required column `japanese` to the `Vocabulary` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reading` to the `Vocabulary` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Vocabulary` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- AlterTable
ALTER TABLE "Vocabulary" DROP COLUMN "explanation",
DROP COLUMN "isRead",
DROP COLUMN "level",
DROP COLUMN "meaning",
DROP COLUMN "word",
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "correctCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "difficulty" "Difficulty" NOT NULL DEFAULT 'BEGINNER',
ADD COLUMN     "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
ADD COLUMN     "english" TEXT NOT NULL,
ADD COLUMN     "exampleEnglish" TEXT NOT NULL,
ADD COLUMN     "exampleReading" TEXT NOT NULL,
ADD COLUMN     "incorrectCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "intervalDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isBookmarked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isLearned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "japanese" TEXT NOT NULL,
ADD COLUMN     "jlptLevel" "JLPT" NOT NULL DEFAULT 'N5',
ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "nextReviewAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "pitchAccent" TEXT,
ADD COLUMN     "reading" TEXT NOT NULL,
ADD COLUMN     "reviews" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Vocabulary_nextReviewAt_idx" ON "Vocabulary"("nextReviewAt");

-- CreateIndex
CREATE INDEX "Vocabulary_jlptLevel_difficulty_idx" ON "Vocabulary"("jlptLevel", "difficulty");
