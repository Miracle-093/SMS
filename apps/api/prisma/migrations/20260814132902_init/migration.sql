/*
  Warnings:

  - Added the required column `newClassId` to the `StudentPromotion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `promotionDate` to the `StudentPromotion` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('APPLICANT', 'ACTIVE', 'INACTIVE', 'GRADUATED');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "newValue" JSONB,
ADD COLUMN     "previousValue" JSONB;

-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "address" TEXT,
ADD COLUMN     "admissionNumberPrefix" TEXT DEFAULT 'ADM',
ADD COLUMN     "currentAcademicYearId" TEXT,
ADD COLUMN     "currentTermId" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "nextAdmissionSequence" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "admissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currentAcademicYearId" TEXT,
ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "gender" "Gender" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "medicalNotes" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "previousSchool" TEXT,
ADD COLUMN     "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "supportingDocuments" JSONB;

-- AlterTable
ALTER TABLE "StudentPortalCredential" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StudentPromotion" ADD COLUMN     "newAcademicYearId" TEXT,
ADD COLUMN     "newClassId" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "previousAcademicYearId" TEXT,
ADD COLUMN     "previousClassId" TEXT,
ADD COLUMN     "promotedBy" TEXT,
ADD COLUMN     "promotionDate" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "toClassId" DROP NOT NULL,
ALTER COLUMN "effectiveAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Term" ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
