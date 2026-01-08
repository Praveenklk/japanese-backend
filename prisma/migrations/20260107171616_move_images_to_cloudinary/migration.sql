/*
  Warnings:

  - You are about to drop the column `image` on the `Hiragana` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `Katakana` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `Vocabulary` table. All the data in the column will be lost.
  - Added the required column `imageUrl` to the `Hiragana` table without a default value. This is not possible if the table is not empty.
  - Added the required column `imageUrl` to the `Katakana` table without a default value. This is not possible if the table is not empty.
  - Added the required column `imageUrl` to the `Vocabulary` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Hiragana" DROP COLUMN "image",
ADD COLUMN     "imageUrl" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Katakana" DROP COLUMN "image",
ADD COLUMN     "imageUrl" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Vocabulary" DROP COLUMN "image",
ADD COLUMN     "imageUrl" TEXT NOT NULL;
