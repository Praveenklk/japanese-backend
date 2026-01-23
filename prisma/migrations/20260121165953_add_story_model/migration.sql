-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('AVAILABLE', 'LOCKED', 'DRAFT');

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "japaneseTitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "level" "JLPT" NOT NULL DEFAULT 'N5',
    "duration" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "tags" TEXT[],
    "content" JSONB NOT NULL,
    "comprehensionQuiz" JSONB NOT NULL,
    "isBookmarked" BOOLEAN NOT NULL DEFAULT false,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "status" "StoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);
