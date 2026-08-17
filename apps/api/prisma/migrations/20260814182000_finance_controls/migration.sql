-- Additive finance, approval and risk-control migration for Phase 1.

ALTER TABLE "FeeStructure"
  ADD COLUMN IF NOT EXISTS "academicYearId" TEXT,
  ADD COLUMN IF NOT EXISTS "termId" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'Tuition',
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "isMandatory" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "StudentInvoice"
  ADD COLUMN IF NOT EXISTS "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ISSUED',
  ADD COLUMN IF NOT EXISTS "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "adjustmentTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "StudentInvoice"
SET "amountPaid" = GREATEST("amount" - "balance", 0)
WHERE "amountPaid" = 0;

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "reference" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "receivedBy" TEXT;

ALTER TABLE "PaymentReversal"
  ADD COLUMN IF NOT EXISTS "requestedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "decisionReason" TEXT;

ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "expenseNo" TEXT,
  ADD COLUMN IF NOT EXISTS "department" TEXT,
  ADD COLUMN IF NOT EXISTS "method" TEXT,
  ADD COLUMN IF NOT EXISTS "payee" TEXT,
  ADD COLUMN IF NOT EXISTS "reference" TEXT,
  ADD COLUMN IF NOT EXISTS "requestedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "supportingDocument" TEXT,
  ADD COLUMN IF NOT EXISTS "budgetId" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

ALTER TABLE "Budget"
  ADD COLUMN IF NOT EXISTS "academicYearId" TEXT,
  ADD COLUMN IF NOT EXISTS "termId" TEXT,
  ADD COLUMN IF NOT EXISTS "department" TEXT NOT NULL DEFAULT 'School-wide',
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS "committedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "spentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "warningThreshold" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS "hardCap" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "period" TEXT;

ALTER TABLE "ApprovalWorkflow"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE TEXT USING "status"::text,
  ALTER COLUMN "status" SET DEFAULT 'SUBMITTED',
  ADD COLUMN IF NOT EXISTS "approvalLevel" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "decision" TEXT,
  ADD COLUMN IF NOT EXISTS "decisionDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "comment" TEXT,
  ADD COLUMN IF NOT EXISTS "nextApprover" TEXT;

CREATE TABLE IF NOT EXISTS "StudentInvoiceLine" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Receipt" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "receiptNo" TEXT NOT NULL,
  "displayNo" TEXT NOT NULL,
  "amountWords" TEXT,
  "printedAt" TIMESTAMP(3),
  "reprintCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FeeAdjustment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "deviceId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
  "lastSyncedAt" TIMESTAMP(3),
  "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "deletedAt" TIMESTAMP(3),
  "studentId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "adjustmentType" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "percentage" DECIMAL(6,2),
  "reason" TEXT NOT NULL,
  "requestedBy" TEXT,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "notes" TEXT,
  CONSTRAINT "FeeAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FinancialSetting" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "maximumDepartmentBudget" DECIMAL(12,2) NOT NULL DEFAULT 50000000,
  "maximumSingleExpense" DECIMAL(12,2) NOT NULL DEFAULT 2000000,
  "maximumTransactionNoApproval" DECIMAL(12,2) NOT NULL DEFAULT 1000000,
  "dailySpendingThreshold" DECIMAL(12,2) NOT NULL DEFAULT 5000000,
  "feeWaiverApprovalThreshold" DECIMAL(12,2) NOT NULL DEFAULT 500000,
  "paymentReversalApprovalThreshold" DECIMAL(12,2) NOT NULL DEFAULT 250000,
  "inventoryAdjustmentThreshold" DECIMAL(12,2) NOT NULL DEFAULT 1000000,
  "budgetUtilizationWarningPercentage" INTEGER NOT NULL DEFAULT 80,
  "workingHoursStart" TEXT NOT NULL DEFAULT '07:00',
  "workingHoursEnd" TEXT NOT NULL DEFAULT '18:00',
  "segregationOfDuties" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RiskAlert" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "amount" DECIMAL(12,2),
  "userId" TEXT,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "notes" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiskAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FeeStructure_schoolId_academicYearId_termId_classId_categor_key" ON "FeeStructure"("schoolId", "academicYearId", "termId", "classId", "category", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_schoolId_reference_key" ON "Payment"("schoolId", "reference");
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_paymentId_key" ON "Receipt"("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_schoolId_receiptNo_key" ON "Receipt"("schoolId", "receiptNo");
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_schoolId_expenseNo_key" ON "Expense"("schoolId", "expenseNo");
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_schoolId_reference_key" ON "Expense"("schoolId", "reference");
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialSetting_schoolId_key" ON "FinancialSetting"("schoolId");
CREATE INDEX IF NOT EXISTS "RiskAlert_schoolId_status_idx" ON "RiskAlert"("schoolId", "status");
CREATE INDEX IF NOT EXISTS "RiskAlert_schoolId_severity_idx" ON "RiskAlert"("schoolId", "severity");

ALTER TABLE "StudentInvoiceLine" ADD CONSTRAINT "StudentInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "StudentInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "StudentInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeeStructure" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Receipt" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "FeeAdjustment" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "FinancialSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "RiskAlert" ALTER COLUMN "updatedAt" DROP DEFAULT;
