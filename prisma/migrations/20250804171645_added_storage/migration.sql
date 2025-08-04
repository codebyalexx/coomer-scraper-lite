/*
  Warnings:

  - You are about to drop the column `server` on the `File` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."File" DROP COLUMN "server",
ADD COLUMN     "storageId" TEXT;

-- CreateTable
CREATE TABLE "public"."Storage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,

    CONSTRAINT "Storage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_storageId_fkey" FOREIGN KEY ("storageId") REFERENCES "public"."Storage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
