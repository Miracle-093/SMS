import { z } from "zod";

export const syncableFieldsSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  deviceId: z.string().uuid().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
  syncStatus: z.enum(["PENDING", "SYNCED", "FAILED", "CONFLICT"]),
  lastSyncedAt: z.string().datetime().nullable(),
  approvalStatus: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED"]),
  deletedAt: z.string().datetime().nullable()
});

export const teacherAttendanceKioskSchema = z.object({
  staffId: z.string().min(2),
  pin: z.string().min(4).max(12),
  deviceId: z.string().uuid(),
  occurredAt: z.string().datetime()
});

export const correctionRequestSchema = z.object({
  attendanceId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  reason: z.string().min(10),
  requestedCheckInAt: z.string().datetime().nullable(),
  requestedCheckOutAt: z.string().datetime().nullable()
});

export const syncPushSchema = z.object({
  deviceId: z.string().uuid(),
  schoolId: z.string().uuid(),
  changes: z.array(z.object({
    id: z.string().uuid(),
    entityType: z.string().min(1),
    entityId: z.string().uuid(),
    operation: z.enum(["CREATE", "UPDATE", "DELETE"]),
    payload: z.record(z.string(), z.unknown()),
    baseVersion: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
    retryCount: z.number().int().nonnegative()
  }))
});

export const syncPullSchema = z.object({
  deviceId: z.string().uuid(),
  schoolId: z.string().uuid(),
  since: z.string().datetime().nullable()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceId: z.string().uuid().nullable().optional()
});

export const portalLoginSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(8),
  deviceId: z.string().uuid().nullable().optional()
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(10).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/)
});

export const adminPasswordResetSchema = z.object({
  userId: z.string().uuid(),
  temporaryPassword: z.string().min(10)
});

export const adminUserCreateSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  temporaryPassword: z.string().min(10),
  roleIds: z.array(z.string().uuid()).min(1)
});

export const adminUserRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1)
});

export const academicScopeAssignmentSchema = z.object({
  bands: z.array(z.enum(["LOWER", "MIDDLE", "UPPER"])).min(1)
});

export const schoolProfileSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  phone: z.string().min(7).nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().min(2).nullable().optional(),
  admissionNumberPrefix: z.string().min(1).max(12).nullable().optional()
});

export const academicYearSchema = z.object({
  name: z.string().min(2),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isActive: z.boolean().default(false)
}).refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
  message: "Academic year start date must be before end date",
  path: ["endsAt"]
});

export const termSchema = z.object({
  academicYearId: z.string().uuid(),
  name: z.string().min(2),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isCurrent: z.boolean().default(false)
}).refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
  message: "Term start date must be before end date",
  path: ["endsAt"]
});

export const classSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().positive()
});

export const streamSchema = z.object({
  classId: z.string().uuid(),
  name: z.string().min(1)
});

export const subjectSchema = z.object({
  code: z.string().min(2).max(16),
  name: z.string().min(2),
  teacherId: z.string().uuid().nullable().optional()
});

export const teacherSubjectAssignmentSchema = z.object({
  teacherId: z.string().uuid(),
  subjectId: z.string().uuid(),
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullable().optional()
});

export const classTeacherAssignmentSchema = z.object({
  teacherId: z.string().uuid(),
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullable().optional(),
  academicYearId: z.string().uuid(),
  termId: z.string().uuid().nullable().optional()
});

export const gradeBoundarySchema = z.object({
  grade: z.string().min(1).max(4),
  minScore: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  remark: z.string().nullable().optional()
}).refine((value) => value.minScore <= value.maxScore, {
  message: "Minimum score must be less than or equal to maximum score",
  path: ["maxScore"]
});

export const studentRegistrationSchema = z.object({
  id: z.string().uuid().optional(),
  schoolId: z.string().uuid(),
  deviceId: z.string().uuid().nullable().optional(),
  admissionNo: z.string().min(2).nullable().optional(),
  firstName: z.string().min(1),
  middleName: z.string().nullable().optional(),
  lastName: z.string().min(1),
  gender: z.enum(["FEMALE", "MALE", "OTHER"]),
  dateOfBirth: z.string().datetime(),
  currentClassId: z.string().uuid(),
  currentStreamId: z.string().uuid().nullable().optional(),
  currentAcademicYearId: z.string().uuid(),
  admissionDate: z.string().datetime(),
  previousSchool: z.string().nullable().optional(),
  status: z.enum(["APPLICANT", "ACTIVE", "INACTIVE", "GRADUATED"]).default("ACTIVE"),
  guardianFullName: z.string().min(2),
  guardianRelationship: z.string().min(2),
  guardianPhone: z.string().regex(/^[+0-9 ()-]{7,20}$/),
  guardianEmail: z.string().email().nullable().optional(),
  guardianAddress: z.string().nullable().optional(),
  emergencyContact: z.string().regex(/^[+0-9 ()-]{7,20}$/),
  medicalNotes: z.string().nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  supportingDocuments: z.array(z.string().url()).default([]),
  notes: z.string().nullable().optional()
}).refine((value) => new Date(value.dateOfBirth) < new Date(value.admissionDate), {
  message: "Date of birth must be before admission date",
  path: ["dateOfBirth"]
});

export const studentPromotionSchema = z.object({
  studentId: z.string().uuid(),
  previousAcademicYearId: z.string().uuid(),
  previousClassId: z.string().uuid(),
  newAcademicYearId: z.string().uuid(),
  newClassId: z.string().uuid(),
  promotionDate: z.string().datetime(),
  notes: z.string().nullable().optional()
}).refine((value) => value.previousClassId !== value.newClassId || value.previousAcademicYearId !== value.newAcademicYearId, {
  message: "Promotion must change class or academic year",
  path: ["newClassId"]
});

const moneySchema = z.number().positive().finite();
const optionalUuid = z.string().uuid().nullable().optional();

export const feeStructureSchema = z.object({
  academicYearId: optionalUuid,
  termId: optionalUuid,
  classId: z.string().uuid(),
  category: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  description: z.string().max(500).nullable().optional(),
  amount: moneySchema,
  isMandatory: z.boolean().default(true),
  dueDate: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true)
});

export const invoiceGenerationSchema = z.object({
  academicYearId: z.string().uuid().nullable().optional(),
  termId: z.string().uuid(),
  classId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional()
});

export const manualInvoiceSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  feeStructureId: z.string().uuid(),
  dueDate: z.string().datetime(),
  lines: z.array(z.object({
    description: z.string().min(2).max(160),
    category: z.string().min(2).max(80),
    amount: moneySchema
  })).min(1)
});

export const paymentSchema = z.object({
  id: z.string().uuid().optional(),
  invoiceId: z.string().uuid(),
  amount: moneySchema,
  paidAt: z.string().datetime(),
  method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "BANK_DEPOSIT", "CHEQUE", "ONLINE_PAYMENT", "OTHER"]),
  reference: z.string().min(2).max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  receivedBy: z.string().min(2).max(120).nullable().optional(),
  deviceId: z.string().uuid().nullable().optional(),
  offlineReceiptNo: z.string().max(120).nullable().optional()
});

export const reversalRequestSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().min(10).max(500)
});

export const adjustmentSchema = z.object({
  studentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  adjustmentType: z.enum(["PERCENTAGE_DISCOUNT", "FIXED_DISCOUNT", "SCHOLARSHIP", "WAIVER", "OTHER"]),
  amount: moneySchema,
  percentage: z.number().min(0).max(100).nullable().optional(),
  reason: z.string().min(10).max(500),
  notes: z.string().max(500).nullable().optional()
});

export const expenseSchema = z.object({
  id: z.string().uuid().optional(),
  spentAt: z.string().datetime(),
  category: z.string().min(2).max(80),
  department: z.string().min(2).max(80).nullable().optional(),
  description: z.string().min(3).max(500),
  amount: moneySchema,
  method: z.string().min(2).max(80).nullable().optional(),
  payee: z.string().min(2).max(160).nullable().optional(),
  reference: z.string().min(2).max(120).nullable().optional(),
  requestedBy: z.string().uuid().nullable().optional(),
  supportingDocument: z.string().url().nullable().optional(),
  budgetId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  deviceId: z.string().uuid().nullable().optional()
});

export const budgetSchema = z.object({
  academicYearId: optionalUuid,
  termId: optionalUuid,
  name: z.string().min(2).max(120),
  department: z.string().min(2).max(80).default("School-wide"),
  category: z.string().min(2).max(80).default("General"),
  amount: moneySchema,
  warningThreshold: z.number().int().min(1).max(100).default(80),
  hardCap: z.boolean().default(true),
  period: z.string().max(80).nullable().optional(),
  year: z.number().int().min(2000).max(2100)
});

export const budgetRequestSchema = z.object({
  budgetId: z.string().uuid(),
  amount: moneySchema,
  reason: z.string().min(10).max(500)
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "RETURNED_FOR_CORRECTION"]),
  comment: z.string().min(3).max(500).nullable().optional(),
  nextApprover: z.string().uuid().nullable().optional()
});

export const financialSettingsSchema = z.object({
  maximumDepartmentBudget: moneySchema,
  maximumSingleExpense: moneySchema,
  maximumTransactionNoApproval: moneySchema,
  dailySpendingThreshold: moneySchema,
  feeWaiverApprovalThreshold: moneySchema,
  paymentReversalApprovalThreshold: moneySchema,
  inventoryAdjustmentThreshold: moneySchema,
  budgetUtilizationWarningPercentage: z.number().int().min(1).max(100),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  segregationOfDuties: z.boolean()
});

export const riskReviewSchema = z.object({
  status: z.enum(["NEW", "UNDER_REVIEW", "RESOLVED", "FALSE_POSITIVE", "ESCALATED"]),
  notes: z.string().min(3).max(1000).nullable().optional()
});

export const examinationSchema = z.object({
  termId: z.string().uuid(),
  academicYearId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(160),
  examinationType: z.string().min(2).max(80),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z.enum(["DRAFT", "OPEN", "MARKS_ENTRY", "UNDER_REVIEW", "APPROVED", "PUBLISHED", "CLOSED"]).default("DRAFT"),
  description: z.string().max(1000).nullable().optional()
}).refine((value) => new Date(value.startsAt) <= new Date(value.endsAt), {
  message: "Examination start date must be before end date",
  path: ["endsAt"]
});

export const assessmentSchema = z.object({
  termId: z.string().uuid(),
  examinationId: z.string().uuid(),
  subjectId: z.string().uuid(),
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullable().optional(),
  teacherId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(120),
  maxScore: z.number().positive().max(1000),
  weight: z.number().positive().max(100).default(100),
  passMark: z.number().min(0).nullable().optional()
});

export const marksEntrySchema = z.object({
  assessmentId: z.string().uuid(),
  entries: z.array(z.object({
    studentId: z.string().uuid(),
    score: z.number().min(0),
    teacherComment: z.string().max(500).nullable().optional()
  })).min(1),
  status: z.enum(["DRAFT", "SUBMITTED"]).default("DRAFT"),
  deviceId: z.string().uuid().nullable().optional()
});

export const resultDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "RETURNED", "PUBLISHED"]),
  comment: z.string().max(500).nullable().optional()
});

export const reportCardCommentSchema = z.object({
  classTeacherComment: z.string().max(800).nullable().optional(),
  headTeacherComment: z.string().max(800).nullable().optional(),
  promotionStatus: z.string().max(120).nullable().optional(),
  nextTermOpeningDate: z.string().datetime().nullable().optional()
});

export const timetableEntrySchema = z.object({
  academicYearId: z.string().uuid(),
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid(),
  room: z.string().max(80).nullable().optional(),
  dayOfWeek: z.number().int().min(1).max(7),
  periodNumber: z.number().int().positive(),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/),
  endsAt: z.string().regex(/^\d{2}:\d{2}$/)
});

export const inventoryItemSchema = z.object({
  sku: z.string().min(2).max(40),
  name: z.string().min(2).max(160),
  category: z.string().min(2).max(80),
  description: z.string().max(500).nullable().optional(),
  unit: z.string().min(1).max(40),
  reorderLevel: z.number().int().nonnegative(),
  unitCost: z.number().nonnegative().default(0),
  storageLocation: z.string().max(120).nullable().optional(),
  isActive: z.boolean().default(true)
});

export const stockMovementSchema = z.object({
  inventoryItemId: z.string().uuid(),
  movementType: z.enum(["IN", "OUT", "ADJUSTMENT", "DAMAGED", "MISSING", "WRITE_OFF"]),
  quantity: z.number().int().positive(),
  unitCost: z.number().nonnegative().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  departmentOrPerson: z.string().max(160).nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  reason: z.string().min(3).max(500),
  occurredAt: z.string().datetime(),
  approvalStatus: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED"]).default("APPROVED")
});

export const payrollProfileSchema = z.object({
  teacherId: z.string().uuid(),
  employeeNo: z.string().min(2).max(40),
  employmentStatus: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE"),
  department: z.string().max(80).nullable().optional(),
  baseSalary: moneySchema,
  paymentMethod: z.string().max(80).nullable().optional(),
  paymentAccount: z.string().max(120).nullable().optional(),
  effectiveAt: z.string().datetime(),
  isActive: z.boolean().default(true)
});

export const payrollRunSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  notes: z.string().max(500).nullable().optional()
});

export const payrollComponentSchema = z.object({
  payrollProfileId: z.string().uuid(),
  componentType: z.enum(["EARNING", "DEDUCTION"]),
  name: z.string().min(2).max(120),
  amount: moneySchema,
  effectiveAt: z.string().datetime()
});

export const notificationTemplateSchema = z.object({
  name: z.string().min(2).max(120),
  channel: z.enum(["IN_APP", "EMAIL", "SMS"]),
  subject: z.string().max(160).nullable().optional(),
  body: z.string().min(2).max(2000),
  variables: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true)
});

export const announcementSchema = z.object({
  title: z.string().min(2).max(160),
  message: z.string().min(2).max(3000),
  audience: z.string().min(2).max(80),
  classId: z.string().uuid().nullable().optional(),
  streamId: z.string().uuid().nullable().optional(),
  academicYearId: z.string().uuid().nullable().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  publishAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable().optional()
});
