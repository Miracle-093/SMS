DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'FeeAdjustment' AND column_name = 'updatedAt') THEN
    ALTER TABLE "FeeAdjustment" ALTER COLUMN "updatedAt" DROP DEFAULT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'FeeStructure' AND column_name = 'updatedAt') THEN
    ALTER TABLE "FeeStructure" ALTER COLUMN "updatedAt" DROP DEFAULT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'FinancialSetting' AND column_name = 'updatedAt') THEN
    ALTER TABLE "FinancialSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Receipt' AND column_name = 'updatedAt') THEN
    ALTER TABLE "Receipt" ALTER COLUMN "updatedAt" DROP DEFAULT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'RiskAlert' AND column_name = 'updatedAt') THEN
    ALTER TABLE "RiskAlert" ALTER COLUMN "updatedAt" DROP DEFAULT;
  END IF;
END $$;

-- RenameIndex
ALTER INDEX IF EXISTS "FeeStructure_scope_key" RENAME TO "FeeStructure_schoolId_academicYearId_termId_classId_categor_key";
