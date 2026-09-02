CREATE TYPE "AcademicLevelBand" AS ENUM ('LOWER', 'MIDDLE', 'UPPER');

CREATE TABLE "AcademicScopeAssignment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "band" "AcademicLevelBand" NOT NULL,
  "minLevel" INTEGER NOT NULL,
  "maxLevel" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AcademicScopeAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademicScopeAssignment_userId_band_key"
  ON "AcademicScopeAssignment"("userId", "band");

CREATE INDEX "AcademicScopeAssignment_schoolId_userId_isActive_idx"
  ON "AcademicScopeAssignment"("schoolId", "userId", "isActive");

CREATE INDEX "AcademicScopeAssignment_schoolId_band_isActive_idx"
  ON "AcademicScopeAssignment"("schoolId", "band", "isActive");

ALTER TABLE "AcademicScopeAssignment"
  ADD CONSTRAINT "AcademicScopeAssignment_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AcademicScopeAssignment"
  ADD CONSTRAINT "AcademicScopeAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
