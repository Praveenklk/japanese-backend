-- AlterTable
ALTER TABLE "Hiragana" ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Katakana" ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Vocabulary" ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "audioUrl" DROP NOT NULL,
ALTER COLUMN "imageUrl" DROP NOT NULL;
