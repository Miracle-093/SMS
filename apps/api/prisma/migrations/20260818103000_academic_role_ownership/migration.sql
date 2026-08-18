ALTER TABLE "ReportCard"
  ADD COLUMN "preparedBy" TEXT,
  ADD COLUMN "preparedAt" TIMESTAMP(3),
  ADD COLUMN "finalApprovedBy" TEXT,
  ADD COLUMN "finalApprovedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

CREATE TABLE "ClassTeacherAssignment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "streamId" TEXT,
  "academicYearId" TEXT NOT NULL,
  "termId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClassTeacherAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassTeacherAssignment_teacherId_classId_streamId_academicYearId_key"
  ON "ClassTeacherAssignment"("teacherId", "classId", "streamId", "academicYearId");

CREATE INDEX "ClassTeacherAssignment_schoolId_classId_streamId_idx"
  ON "ClassTeacherAssignment"("schoolId", "classId", "streamId");

CREATE INDEX "ClassTeacherAssignment_schoolId_teacherId_isActive_idx"
  ON "ClassTeacherAssignment"("schoolId", "teacherId", "isActive");

ALTER TABLE "ClassTeacherAssignment"
  ADD CONSTRAINT "ClassTeacherAssignment_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassTeacherAssignment"
  ADD CONSTRAINT "ClassTeacherAssignment_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassTeacherAssignment"
  ADD CONSTRAINT "ClassTeacherAssignment_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassTeacherAssignment"
  ADD CONSTRAINT "ClassTeacherAssignment_streamId_fkey"
  FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClassTeacherAssignment"
  ADD CONSTRAINT "ClassTeacherAssignment_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassTeacherAssignment"
  ADD CONSTRAINT "ClassTeacherAssignment_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;
