export enum SyncStatus {
  Pending = "PENDING",
  Synced = "SYNCED",
  Failed = "FAILED",
  Conflict = "CONFLICT"
}

export enum ApprovalStatus {
  Draft = "DRAFT",
  Pending = "PENDING",
  Approved = "APPROVED",
  Rejected = "REJECTED"
}

export enum UserRole {
  SuperAdministrator = "SUPER_ADMINISTRATOR",
  Administrator = "ADMINISTRATOR",
  SchoolAdministrator = "SCHOOL_ADMINISTRATOR",
  HeadTeacher = "HEAD_TEACHER",
  Teacher = "TEACHER",
  Bursar = "BURSAR",
  Accountant = "ACCOUNTANT",
  Receptionist = "RECEPTIONIST",
  InventoryManager = "INVENTORY_MANAGER",
  Guardian = "GUARDIAN",
  Student = "STUDENT"
}

export enum Gender {
  Female = "FEMALE",
  Male = "MALE",
  Other = "OTHER"
}

export enum StudentStatus {
  Applicant = "APPLICANT",
  Active = "ACTIVE",
  Inactive = "INACTIVE",
  Graduated = "GRADUATED"
}

export enum PermissionKey {
  AuthLogin = "auth.login",
  UsersManage = "users.manage",
  SchoolConfigManage = "school-config.manage",
  StudentsRead = "students.read",
  StudentsManage = "students.manage",
  StudentsPromote = "students.promote",
  PortalCredentialsReset = "portal-credentials.reset",
  AuditRead = "audit.read",
  DashboardRead = "dashboard.read",
  FinanceRead = "finance.read",
  FinanceManage = "finance.manage",
  BudgetManage = "budget.manage",
  ApprovalReview = "approval.review",
  RiskReview = "risk.review",
  AcademicsRead = "academics.read",
  AcademicsManage = "academics.manage",
  MarksEntry = "marks.entry",
  ResultsApprove = "results.approve",
  TimetableManage = "timetable.manage",
  InventoryManage = "inventory.manage",
  PayrollRead = "payroll.read",
  PayrollManage = "payroll.manage",
  NotificationsManage = "notifications.manage",
  AnnouncementsManage = "announcements.manage",
  PortalAccess = "portal.access",
  AttendanceManage = "attendance.manage",
  SyncReview = "sync.review"
}

export enum InvoiceStatus {
  Draft = "DRAFT",
  Issued = "ISSUED",
  PartiallyPaid = "PARTIALLY_PAID",
  Paid = "PAID",
  Overdue = "OVERDUE",
  Cancelled = "CANCELLED"
}

export enum PaymentMethod {
  Cash = "CASH",
  MobileMoney = "MOBILE_MONEY",
  BankTransfer = "BANK_TRANSFER",
  BankDeposit = "BANK_DEPOSIT",
  Cheque = "CHEQUE",
  OnlinePayment = "ONLINE_PAYMENT",
  Other = "OTHER"
}

export enum WorkflowStatus {
  Draft = "DRAFT",
  Submitted = "SUBMITTED",
  UnderReview = "UNDER_REVIEW",
  Approved = "APPROVED",
  Rejected = "REJECTED",
  Returned = "RETURNED_FOR_CORRECTION",
  Cancelled = "CANCELLED"
}

export enum RiskAlertStatus {
  New = "NEW",
  UnderReview = "UNDER_REVIEW",
  Resolved = "RESOLVED",
  FalsePositive = "FALSE_POSITIVE",
  Escalated = "ESCALATED"
}

export enum TeacherAttendanceStatus {
  CheckedIn = "CHECKED_IN",
  CheckedOut = "CHECKED_OUT",
  Late = "LATE",
  CorrectionRequested = "CORRECTION_REQUESTED",
  Corrected = "CORRECTED"
}

export enum ConflictSensitivity {
  Normal = "NORMAL",
  Sensitive = "SENSITIVE"
}

export enum SyncEntityType {
  TeacherAttendance = "TEACHER_ATTENDANCE",
  Student = "STUDENT",
  Guardian = "GUARDIAN",
  Payment = "PAYMENT",
  PaymentReversal = "PAYMENT_REVERSAL",
  Expense = "EXPENSE",
  BudgetRequest = "BUDGET_REQUEST",
  InventoryItem = "INVENTORY_ITEM",
  StockMovement = "STOCK_MOVEMENT",
  PayrollRecord = "PAYROLL_RECORD",
  AssessmentMark = "ASSESSMENT_MARK"
}

export interface SyncableRecord {
  id: string;
  schoolId: string;
  deviceId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  approvalStatus: ApprovalStatus;
  deletedAt: string | null;
}

export interface PendingChange {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  payload: Record<string, unknown>;
  baseVersion: number | null;
  createdAt: string;
  retryCount: number;
}

export interface SyncPushRequest {
  deviceId: string;
  schoolId: string;
  changes: PendingChange[];
}

export interface SyncPullRequest {
  deviceId: string;
  schoolId: string;
  since: string | null;
}

export interface SyncConflict {
  entityType: SyncEntityType;
  entityId: string;
  localVersion: number;
  serverVersion: number;
  sensitivity: ConflictSensitivity;
  reason: string;
}

export interface CurrentUser {
  id: string;
  schoolId: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
}

export interface StudentRegistration {
  id?: string;
  schoolId: string;
  admissionNo?: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: Gender;
  dateOfBirth: string;
  currentClassId: string;
  currentStreamId?: string | null;
  currentAcademicYearId: string;
  admissionDate: string;
  previousSchool?: string | null;
  status: StudentStatus;
  guardianFullName: string;
  guardianRelationship: string;
  guardianPhone: string;
  guardianEmail?: string | null;
  guardianAddress?: string | null;
  emergencyContact: string;
  medicalNotes?: string | null;
  photoUrl?: string | null;
  supportingDocuments?: string[];
  notes?: string | null;
}
