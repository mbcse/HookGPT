/*
  Warnings:

  - You are about to drop the `CharacterFile` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CharacterFile" DROP CONSTRAINT "CharacterFile_sessionId_fkey";

-- DropTable
DROP TABLE "CharacterFile";

-- CreateTable
CREATE TABLE "HookCode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "gasEstimate" TEXT,
    "implementationDetails" JSONB,
    "testCode" TEXT,
    "examples" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "HookCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HookCode_sessionId_key" ON "HookCode"("sessionId");

-- AddForeignKey
ALTER TABLE "HookCode" ADD CONSTRAINT "HookCode_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
