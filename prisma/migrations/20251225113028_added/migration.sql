-- CreateTable
CREATE TABLE "PopularPost" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,

    CONSTRAINT "PopularPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularFile" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "postId" TEXT,

    CONSTRAINT "PopularFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularFileMetadata" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "PopularFileMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PopularFileMetadata_fileId_key" ON "PopularFileMetadata"("fileId");

-- AddForeignKey
ALTER TABLE "PopularFile" ADD CONSTRAINT "PopularFile_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PopularPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularFileMetadata" ADD CONSTRAINT "PopularFileMetadata_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "PopularFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
