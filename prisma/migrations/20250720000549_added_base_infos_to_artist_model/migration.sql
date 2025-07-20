/*
  Warnings:

  - Added the required column `identifier` to the `Artist` table without a default value. This is not possible if the table is not empty.
  - Added the required column `service` to the `Artist` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Artist" ADD COLUMN     "identifier" TEXT NOT NULL,
ADD COLUMN     "service" TEXT NOT NULL;
