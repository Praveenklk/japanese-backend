-- CreateEnum
CREATE TYPE "JLPT" AS ENUM ('N5', 'N4', 'N3');

-- CreateTable
CREATE TABLE "Hiragana" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "romaji" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "example" TEXT,
    "image" BYTEA NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hiragana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Katakana" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "romaji" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "example" TEXT,
    "image" BYTEA NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Katakana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vocabulary" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "level" "JLPT" NOT NULL DEFAULT 'N5',
    "image" BYTEA,
    "audioUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vocabulary_pkey" PRIMARY KEY ("id")
);
