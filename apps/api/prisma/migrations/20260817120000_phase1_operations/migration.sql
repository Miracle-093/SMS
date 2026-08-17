-- Phase 1 operations: academics, timetable, inventory, payroll, notifications, and portal support.
-- Additive only. Existing data is preserved.

ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "employmentType" TEXT;

ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "academicYearId" TEXT;
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "examinationType" TEXT NOT NULL DEFAULT 'Test';
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Examination" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "classId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "streamId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "teacherId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "weight" DECIMAL(6,2) NOT NULL DEFAULT 100;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "passMark" DECIMAL(6,2);
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "submittedBy" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "reviewComment" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "weightedScore" DECIMAL(8,2);
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "grade" TEXT;
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "teacherComment" TEXT;
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "submittedBy" TEXT;
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "reviewComment" TEXT;
ALTER TABLE "Mark" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

ALTER TABLE "GradeBoundary" ADD COLUMN IF NOT EXISTS "points" DECIMAL(4,2);
ALTER TABLE "GradeBoundary" ADD COLUMN IF NOT EXISTS "isPass" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "examinationId" TEXT;
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "classId" TEXT;
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "streamId" TEXT;
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "subjectResults" JSONB;
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "classTeacherComment" TEXT;
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "headTeacherComment" TEXT;
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "promotionStatus" TEXT;
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "nextTermOpeningDate" TIMESTAMP(3);
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "ReportCard" ADD COLUMN IF NOT EXISTS "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'General';
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'unit';
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "storageLocation" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(12,2);
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "departmentOrPerson" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

ALTER TABLE "PayrollRecord" ADD COLUMN IF NOT EXISTS "payrollRunId" TEXT;
ALTER TABLE "PayrollRecord" ADD COLUMN IF NOT EXISTS "payrollProfileId" TEXT;
ALTER TABLE "PayrollRecord" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "PayrollRecord" ADD COLUMN IF NOT EXISTS "paymentAccount" TEXT;
ALTER TABLE "PayrollRecord" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "PayrollRecord" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'IN_APP';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "payload" JSONB;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "TeacherSubjectAssignment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "streamId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherSubjectAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeacherSubjectAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TimetableEntry" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "streamId" TEXT,
  "subjectId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "room" TEXT,
  "dayOfWeek" INTEGER NOT NULL,
  "periodNumber" INTEGER NOT NULL,
  "startsAt" TEXT NOT NULL,
  "endsAt" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimetableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "InventorySupplier" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventorySupplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PayrollProfile" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "employeeNo" TEXT NOT NULL,
  "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "department" TEXT,
  "baseSalary" DECIMAL(12,2) NOT NULL,
  "paymentMethod" TEXT,
  "paymentAccount" TEXT,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PayrollProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PayrollComponent" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "payrollProfileId" TEXT NOT NULL,
  "componentType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollComponent_payrollProfileId_fkey" FOREIGN KEY ("payrollProfileId") REFERENCES "PayrollProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PayrollRun" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "grossTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "deductionTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdBy" TEXT,
  "submittedBy" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationTemplate" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "variables" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Announcement" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "classId" TEXT,
  "streamId" TEXT,
  "academicYearId" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "publishAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeacherSubjectAssignment_teacherId_subjectId_classId_streamId_key" ON "TeacherSubjectAssignment"("teacherId", "subjectId", "classId", "streamId");
CREATE INDEX IF NOT EXISTS "TeacherSubjectAssignment_schoolId_classId_subjectId_idx" ON "TeacherSubjectAssignment"("schoolId", "classId", "subjectId");
CREATE INDEX IF NOT EXISTS "TimetableEntry_schoolId_termId_classId_streamId_idx" ON "TimetableEntry"("schoolId", "termId", "classId", "streamId");
CREATE INDEX IF NOT EXISTS "TimetableEntry_schoolId_teacherId_dayOfWeek_idx" ON "TimetableEntry"("schoolId", "teacherId", "dayOfWeek");
CREATE UNIQUE INDEX IF NOT EXISTS "InventorySupplier_schoolId_name_key" ON "InventorySupplier"("schoolId", "name");
CREATE INDEX IF NOT EXISTS "StockMovement_schoolId_inventoryItemId_occurredAt_idx" ON "StockMovement"("schoolId", "inventoryItemId", "occurredAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollProfile_schoolId_employeeNo_key" ON "PayrollProfile"("schoolId", "employeeNo");
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollProfile_schoolId_teacherId_key" ON "PayrollProfile"("schoolId", "teacherId");
CREATE INDEX IF NOT EXISTS "PayrollComponent_schoolId_payrollProfileId_componentType_idx" ON "PayrollComponent"("schoolId", "payrollProfileId", "componentType");
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_schoolId_period_key" ON "PayrollRun"("schoolId", "period");
CREATE INDEX IF NOT EXISTS "PayrollRun_schoolId_status_idx" ON "PayrollRun"("schoolId", "status");
CREATE INDEX IF NOT EXISTS "PayrollRecord_schoolId_period_status_idx" ON "PayrollRecord"("schoolId", "period", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationTemplate_schoolId_name_channel_key" ON "NotificationTemplate"("schoolId", "name", "channel");
CREATE INDEX IF NOT EXISTS "Announcement_schoolId_audience_publishAt_idx" ON "Announcement"("schoolId", "audience", "publishAt");
CREATE INDEX IF NOT EXISTS "Examination_schoolId_termId_status_idx" ON "Examination"("schoolId", "termId", "status");
CREATE INDEX IF NOT EXISTS "Assessment_schoolId_examinationId_classId_subjectId_idx" ON "Assessment"("schoolId", "examinationId", "classId", "subjectId");
CREATE INDEX IF NOT EXISTS "Mark_schoolId_assessmentId_status_idx" ON "Mark"("schoolId", "assessmentId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ReportCard_studentId_termId_examinationId_key" ON "ReportCard"("studentId", "termId", "examinationId");
CREATE INDEX IF NOT EXISTS "ReportCard_schoolId_termId_status_idx" ON "ReportCard"("schoolId", "termId", "status");
CREATE INDEX IF NOT EXISTS "Notification_schoolId_recipientType_recipientId_status_idx" ON "Notification"("schoolId", "recipientType", "recipientId", "status");
