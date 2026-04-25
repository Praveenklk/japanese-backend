-- CreateTable
CREATE TABLE "DailyLearning" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "vocabulary" JSONB NOT NULL,
    "grammar" JSONB NOT NULL,
    "quiz" JSONB NOT NULL,
    "kanji" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyLearning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyLearning_date_key" ON "DailyLearning"("date");
