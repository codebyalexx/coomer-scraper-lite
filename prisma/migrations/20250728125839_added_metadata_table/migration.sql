-- CreateTable
CREATE TABLE "FileMetadata" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "FileMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileMetadata_fileId_key" ON "FileMetadata"("fileId");

-- AddForeignKey
ALTER TABLE "FileMetadata" ADD CONSTRAINT "FileMetadata_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
