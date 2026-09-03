import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PermissionKey, SyncEntityType } from "@aethina/shared-types";
import {
  addPendingChange,
  clearLocalStudents,
  getLastSync,
  initializeOfflineStore,
  readLocalExpenses,
  readLocalPayments,
  readLocalStudents,
  readPendingChanges,
  setLastSync as persistLastSync,
  upsertLocalExpense,
  upsertLocalPayment,
  upsertLocalStudent,
  writePendingChanges,
  type PendingChange
} from "./offline-store.js";
import { apiBaseUrl } from "./config.js";
import { TeacherAttendanceKiosk } from "./teacher-attendance-kiosk.js";
import { AppNotice, PermissionDeniedState, UserIdentity, errorForResponse, toUserFacingError, userMessage, type UserFacingError } from "./ui.js";
import "./styles.css";

const deviceId = "00000000-0000-4000-8000-000000000001";
const demoMode = import.meta.env.VITE_DEMO_MODE === "true" || import.meta.env.DEV;

type Session = {
  accessToken: string;
  user: { id: string; schoolId: string; displayName: string; email: string; roles: string[]; permissions: string[]; mustChangePassword: boolean };
};

type ActiveView = "dashboard" | "users" | "students" | "academics" | "timetable" | "finance" | "budgets" | "inventory" | "payroll" | "notifications" | "approvals" | "attendance" | "school" | "sync" | "risk" | "audit";

type AppSection = {
  id: ActiveView;
  label: string;
  group: "Command" | "Learners" | "Academics" | "Finance" | "Operations" | "Governance";
  permissions: PermissionKey[];
};

type Persona = {
  kicker: string;
  title: string;
  summary: string;
};

type RoleWorkspace = {
  focus: Array<{ label: string; value: string; view: ActiveView }>;
  routines: string[];
  alerts: string[];
  actions: Array<{ label: string; view: ActiveView }>;
};

const appSections: AppSection[] = [
  { id: "dashboard", label: "Dashboard", group: "Command", permissions: [PermissionKey.DashboardRead] },
  { id: "users", label: "Users & Roles", group: "Command", permissions: [PermissionKey.UsersManage] },
  { id: "students", label: "Students", group: "Learners", permissions: [PermissionKey.StudentsRead] },
  { id: "academics", label: "Academics", group: "Academics", permissions: [PermissionKey.AcademicsRead, PermissionKey.AcademicsManage, PermissionKey.MarksEntry, PermissionKey.MarksReview, PermissionKey.ReportCardsPrepare, PermissionKey.ReportCardsPublish] },
  { id: "timetable", label: "Timetable", group: "Academics", permissions: [PermissionKey.AcademicsRead, PermissionKey.TimetableManage] },
  { id: "finance", label: "Finance", group: "Finance", permissions: [PermissionKey.FinanceRead, PermissionKey.FinanceManage] },
  { id: "budgets", label: "Budgets", group: "Finance", permissions: [PermissionKey.BudgetManage] },
  { id: "inventory", label: "Inventory", group: "Operations", permissions: [PermissionKey.InventoryManage] },
  { id: "payroll", label: "Payroll", group: "Finance", permissions: [PermissionKey.PayrollRead, PermissionKey.PayrollManage] },
  { id: "notifications", label: "Notifications", group: "Operations", permissions: [PermissionKey.NotificationsManage, PermissionKey.AnnouncementsManage] },
  { id: "approvals", label: "Approvals", group: "Governance", permissions: [PermissionKey.ApprovalReview] },
  { id: "school", label: "School Setup", group: "Command", permissions: [PermissionKey.SchoolConfigManage, PermissionKey.AcademicSetupManage, PermissionKey.TeacherSubjectsManage, PermissionKey.ClassTeachersManage] },
  { id: "attendance", label: "Staff Attendance", group: "Operations", permissions: [PermissionKey.AttendanceManage] },
  { id: "sync", label: "Sync Review", group: "Governance", permissions: [PermissionKey.SyncReview] },
  { id: "risk", label: "Risk Alerts", group: "Governance", permissions: [PermissionKey.RiskReview] },
  { id: "audit", label: "Audit", group: "Governance", permissions: [PermissionKey.AuditRead] }
];

type SchoolConfig = {
  school: { id: string; name: string; code: string; phone?: string; email?: string; address?: string; admissionNumberPrefix?: string; currentAcademicYearId?: string; currentTermId?: string };
  academicYears: Array<{ id: string; name: string; startsAt?: string; endsAt?: string; isActive: boolean; terms: Array<{ id: string; name: string; startsAt?: string; endsAt?: string; isCurrent: boolean }> }>;
  classes: Array<{ id: string; name: string; level: number; streams: Array<{ id: string; name: string }> }>;
  subjects: Array<{ id: string; code: string; name: string; teacherId?: string | null; teacher?: { firstName: string; lastName: string } | null }>;
  gradeBoundaries: Array<{ id: string; grade: string; minScore: string; maxScore: string; remark?: string }>;
  teachers?: Array<{ id: string; userId?: string | null; staffId: string; firstName: string; lastName: string }>;
  teacherSubjectAssignments?: Array<{ id: string; teacherId: string; subjectId: string; classId: string; streamId?: string | null; teacher?: { firstName: string; lastName: string } }>;
  classTeacherAssignments?: Array<{ id: string; teacherId: string; classId: string; streamId?: string | null; teacher?: { firstName: string; lastName: string }; class?: { name: string }; stream?: { name: string } | null }>;
  academicScopeAssignments?: Array<{ id: string; userId: string; band: "LOWER" | "MIDDLE" | "UPPER"; minLevel: number; maxLevel: number; user?: { id: string; displayName: string; email: string } }>;
};

type StudentQuickFilter = {
  label: string;
  classId: string;
  streamId?: string | null;
};

type WorkspaceScopeSummary = {
  title: string;
  description: string;
  chips: string[];
  studentFilters: StudentQuickFilter[];
};

type Student = {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  admissionDate: string;
  status: string;
  currentClassId?: string;
  currentStreamId?: string;
  currentAcademicYearId?: string;
  emergencyContact?: string;
  medicalNotes?: string | null;
  notes?: string | null;
  syncStatus?: string;
  currentClass?: { name: string };
  currentStream?: { name: string };
  guardians?: Array<{ relationship: string; guardian: { fullName: string; phone: string; email?: string; address?: string } }>;
  portalCredential?: { username: string; mustReset: boolean; isActive: boolean };
  promotions?: Array<{ id: string; promotionDate: string; previousClassId?: string; newClassId: string; notes?: string }>;
};

type AttendanceRecord = {
  id: string;
  attendanceDate: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status: string;
  approvalStatus: string;
  correctionReason?: string | null;
  requestedCheckInAt?: string | null;
  requestedCheckOutAt?: string | null;
  teacher: { staffId: string; firstName: string; lastName: string };
};

type SyncConflictRecord = {
  id: string;
  entityType: string;
  entityId: string;
  localVersion: number;
  serverVersion: number;
  sensitivity: string;
  reason: string;
  createdAt: string;
  localPayload: unknown;
  serverPayload: unknown;
};

type AuditRecord = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  metadata?: unknown;
};

type DashboardSummary = {
  asOf: string;
  activeStudents: number;
  teachers: number;
  expectedFees: number | null;
  collectedFees: number | null;
  outstandingFees: number | null;
  collectionPercentage: number | null;
  discountsWaivers: number | null;
  expenses: number | null;
  netCashMovement: number | null;
  attendanceToday: number;
  pendingBudgetApprovals: number;
  pendingExpenseApprovals: number;
  unresolvedSyncConflicts: number;
  suspiciousFinancialActivities: number;
  lowStockItems: number;
  marksAwaitingApproval?: number;
  publishedReportCards?: number;
  activePayrollRuns?: number;
  failedNotifications?: number;
  portalLoginsToday?: number;
};

type TeacherWorkspaceSummary = {
  teacher: { id: string; staffId: string; firstName: string; lastName: string } | null;
  classTeacherAssignments: Array<{ id: string; classId: string; streamId?: string | null; label: string; academicYear: string; term: string }>;
  subjectAssignments: Array<{ id: string; subjectId: string; classId: string; streamId?: string | null; subject: string; label: string }>;
  classLearners: Array<{ classId: string; streamId?: string | null; label: string; activeStudents: number }>;
  openAssessments: Array<{ id: string; name: string; status: string; subject: string; examination: string; classId?: string | null; streamId?: string | null }>;
  timetable: Array<{ id: string; dayOfWeek: number; periodNumber: number; startsAt: string; endsAt: string; room?: string | null; subject: string; class: string }>;
  announcements: Array<{ id: string; title: string; message: string; priority: string; publishAt: string }>;
};

type RosterPreviewResult = {
  classId: string;
  streamId?: string | null;
  totalRows: number;
  validRows: Array<{ admissionNo?: string; firstName: string; middleName?: string; lastName: string }>;
  errors: Array<{ rowNumber: number; messages: string[]; row: { admissionNo?: string; firstName: string; middleName?: string; lastName: string } }>;
  existingMatches: Array<{ row: { admissionNo?: string; firstName: string; middleName?: string; lastName: string }; student: { admissionNo: string; firstName: string; lastName: string } }>;
  mode: "PREVIEW_ONLY";
  nextStep: string;
};

type FinanceOverview = {
  expectedFees: number;
  collectedFees: number;
  outstandingFees: number;
  collectionPercentage: number;
  discounts: number;
  expenses: number;
  netCashMovement: number;
  budgets: Array<BudgetRecord & { remainingAmount: number; utilizationPercentage: number }>;
};

type InvoiceRecord = {
  id: string;
  invoiceNo: string;
  status: string;
  amount: string | number;
  amountPaid: string | number;
  balance: string | number;
  dueDate: string;
  student: Student;
  payments?: Array<{ id: string; receiptNo: string; amount: string | number; method: string; paidAt: string; receipt?: { id: string; receiptNo: string } | null }>;
};

type FeeStructureRecord = {
  id: string;
  classId: string;
  category: string;
  name: string;
  amount: string | number;
  dueDate?: string | null;
  isActive: boolean;
  class?: { name: string };
};

type BudgetRecord = {
  id: string;
  name: string;
  department: string;
  category: string;
  amount: string | number;
  committedAmount: string | number;
  spentAmount: string | number;
  approvalStatus: string;
  year: number;
  requests?: Array<{ id: string; amount: string | number; reason: string; approvalStatus: string }>;
};

type ApprovalRecord = {
  id: string;
  entityType: string;
  entityId: string;
  requestedBy: string;
  currentApprover?: string | null;
  status: string;
  approvalLevel: number;
  createdAt: string;
  comment?: string | null;
};

type RiskAlertRecord = {
  id: string;
  category: string;
  severity: string;
  entityType: string;
  entityId: string;
  amount?: string | number | null;
  reason: string;
  status: string;
  createdAt: string;
  notes?: string | null;
};

type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
  roles: Array<{ role: { id: string; name: string } }>;
  academicScopeAssignments?: Array<{ id: string; band: "LOWER" | "MIDDLE" | "UPPER"; minLevel: number; maxLevel: number }>;
};

type RoleOption = {
  id: string;
  name: string;
  description?: string | null;
  permissions: Array<{ permission: { key: string } }>;
  _count?: { users: number };
};

type RegistrationForm = {
  admissionNo: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: "FEMALE" | "MALE" | "OTHER";
  dateOfBirth: string;
  currentClassId: string;
  currentStreamId: string;
  currentAcademicYearId: string;
  admissionDate: string;
  previousSchool: string;
  status: "ACTIVE" | "APPLICANT" | "INACTIVE" | "GRADUATED";
  guardianFullName: string;
  guardianRelationship: string;
  guardianPhone: string;
  guardianEmail: string;
  guardianAddress: string;
  emergencyContact: string;
  medicalNotes: string;
  photoUrl: string;
  supportingDocuments: string;
  notes: string;
};

const emptyForm: RegistrationForm = {
  admissionNo: "",
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "OTHER",
  dateOfBirth: "2018-01-15",
  currentClassId: "",
  currentStreamId: "",
  currentAcademicYearId: "",
  admissionDate: new Date().toISOString().slice(0, 10),
  previousSchool: "",
  status: "ACTIVE",
  guardianFullName: "",
  guardianRelationship: "Guardian",
  guardianPhone: "",
  guardianEmail: "",
  guardianAddress: "",
  emergencyContact: "",
  medicalNotes: "",
  photoUrl: "",
  supportingDocuments: "",
  notes: ""
};

function App() {
  const [session, setSession] = useState<Session | null>(() => readJson<Session | null>("aethina.session", null));
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [config, setConfig] = useState<SchoolConfig | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [localStudents, setLocalStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [form, setForm] = useState<RegistrationForm>(emptyForm);
  const [filters, setFilters] = useState({ search: "", classId: "", streamId: "", status: "", academicYearId: "" });
  const [online, setOnline] = useState(navigator.onLine);
  const [message, setMessage] = useState("Ready");
  const [errorNotice, setErrorNotice] = useState<UserFacingError | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState("Never");
  const visibleSections = useMemo(() => session ? sectionsForUser(session.user.permissions) : [], [session]);
  const persona = session ? personaFor(session.user.roles, session.user.permissions) : null;
  const permissionSet = useMemo(() => new Set(session?.user.permissions ?? []), [session]);
  const canManageStudents = permissionSet.has(PermissionKey.AdmissionsManage);
  const financeOnly = Boolean(session && isFinanceOnly(session.user.roles, session.user.permissions));
  const activeSection = appSections.find((section) => section.id === activeView);
  const activeViewPermitted = !session || visibleSections.some((section) => section.id === activeView);
  const schoolName = config?.school.name ?? "Satelite Secondary School";
  const roleWorkspaceName = session ? workspaceIdentityFor(session.user.roles, session.user.permissions) : "Staff Workspace";
  const workspaceScope = useMemo(() => session && config ? workspaceScopeFor(session.user, config) : null, [session, config]);

  function showMessage(nextMessage: string) {
    setErrorNotice(null);
    setMessage(nextMessage);
  }

  function showError(error: unknown, fallback?: string) {
    setMessage("");
    setErrorNotice(toUserFacingError(error, fallback));
  }

  function selectView(view: ActiveView) {
    if (visibleSections.some((section) => section.id === view)) {
      setErrorNotice(null);
      setActiveView(view);
      return;
    }
    setErrorNotice({ message: "You do not have permission to access this section." });
    const dashboard = visibleSections.find((section) => section.id === "dashboard");
    setActiveView((dashboard ?? visibleSections[0])?.id ?? "dashboard");
  }

  useEffect(() => {
    void refreshOfflineState();
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (session) {
      void refreshAll();
    }
  }, [session]);

  useEffect(() => {
    if (!session || visibleSections.length === 0) return;
    if (!visibleSections.some((section) => section.id === activeView)) {
      const dashboard = visibleSections.find((section) => section.id === "dashboard");
      setErrorNotice({ message: "You do not have permission to access this section." });
      setActiveView((dashboard ?? visibleSections[0]).id);
    }
  }, [session, visibleSections, activeView]);

  const visibleStudents = useMemo(() => {
    const combined = [...localStudents, ...students];
    return combined.filter((student) => {
      const haystack = `${student.admissionNo} ${student.firstName} ${student.middleName ?? ""} ${student.lastName}`.toLowerCase();
      return (!filters.search || haystack.includes(filters.search.toLowerCase()))
        && (!filters.classId || student.currentClassId === filters.classId)
        && (!filters.streamId || student.currentStreamId === filters.streamId)
        && (!filters.status || student.status === filters.status)
        && (!filters.academicYearId || student.currentAcademicYearId === filters.academicYearId);
    });
  }, [students, localStudents, filters]);

  async function login(email: string, password: string) {
    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, deviceId })
    });
    if (!response.ok) {
      throw new Error("Login failed");
    }
    const nextSession = await response.json();
    localStorage.setItem("aethina.session", JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function logout() {
    localStorage.removeItem("aethina.session");
    setSession(null);
    setStudents([]);
    setConfig(null);
  }

  async function refreshAll() {
    if (!session) return;
    try {
      const [configResponse, studentResponse] = await Promise.all([
        api("/school-config"),
        api(`/students?${new URLSearchParams(stripEmpty(filters)).toString()}`)
      ]);
      setConfig(configResponse);
      setStudents(studentResponse);
      setOnline(true);
      showMessage("Data refreshed");
      await refreshOfflineState();
    } catch (error) {
      setOnline(false);
      showMessage(`Offline mode: ${userMessage(error, "API unavailable")}`);
      await refreshOfflineState();
    }
  }

  async function refreshOfflineState() {
    await initializeOfflineStore();
    const [pending, offlineStudents, storedLastSync] = await Promise.all([
      readPendingChanges(),
      readLocalStudents(),
      getLastSync()
    ]);
    setPendingCount(pending.length);
    setLocalStudents(offlineStudents as Student[]);
    setLastSync(storedLastSync);
  }

  async function api(path: string, init?: RequestInit) {
    if (!session) throw new Error("Not signed in");
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}`, ...(init?.headers ?? {}) }
    });
    if (!response.ok) {
      throw errorForResponse(response.status, await response.text());
    }
    return response.json();
  }

  function applyDefaults(nextConfig: SchoolConfig) {
    setForm((current) => ({
      ...current,
      currentAcademicYearId: current.currentAcademicYearId || nextConfig.school.currentAcademicYearId || nextConfig.academicYears[0]?.id || "",
      currentClassId: current.currentClassId || nextConfig.classes[0]?.id || "",
      currentStreamId: current.currentStreamId || nextConfig.classes[0]?.streams[0]?.id || ""
    }));
  }

  useEffect(() => {
    if (config) applyDefaults(config);
  }, [config]);

  async function submitStudent(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    const registration = { ...toRegistration(form, session.user.schoolId), id: selected?.id };
    if (!registration.firstName || !registration.lastName || !registration.currentClassId || !registration.guardianPhone) {
      showMessage("Please complete required student and guardian fields.");
      return;
    }
    try {
      const result = selected?.syncStatus === "PENDING"
        ? await saveOffline(registration, "UPDATE")
        : await api(selected ? `/students/${selected.id}` : "/students", {
            method: selected ? "PUT" : "POST",
            body: JSON.stringify(registration)
          });
      showMessage(selected ? "Student updated" : `Student registered. Temporary portal password: ${result.portalTemporaryPassword ?? "created offline"}`);
      setForm(emptyForm);
      setSelected(null);
      await refreshAll();
    } catch {
      await saveOffline(registration, selected ? "UPDATE" : "CREATE");
      showMessage("API unavailable. Student saved locally and queued for synchronization.");
    }
  }

  async function saveOffline(registration: ReturnType<typeof toRegistration> & { id?: string }, operation: "CREATE" | "UPDATE") {
    const id = registration.id ?? crypto.randomUUID();
    const localStudent: Student = {
      id,
      admissionNo: registration.admissionNo || `PENDING-${id.slice(0, 8)}`,
      firstName: registration.firstName,
      middleName: registration.middleName,
      lastName: registration.lastName,
      gender: registration.gender,
      dateOfBirth: registration.dateOfBirth,
      admissionDate: registration.admissionDate,
      status: registration.status,
      currentClassId: registration.currentClassId,
      currentStreamId: registration.currentStreamId ?? undefined,
      currentAcademicYearId: registration.currentAcademicYearId,
      emergencyContact: registration.emergencyContact,
      medicalNotes: registration.medicalNotes,
      notes: registration.notes,
      syncStatus: "PENDING",
      guardians: [{ relationship: registration.guardianRelationship, guardian: { fullName: registration.guardianFullName, phone: registration.guardianPhone, email: registration.guardianEmail ?? undefined, address: registration.guardianAddress ?? undefined } }]
    };
    await upsertLocalStudent(localStudent, registration);
    await addPendingChange({
      id: crypto.randomUUID(),
      entityType: SyncEntityType.Student,
      entityId: id,
      operation,
      payload: { registration: { ...registration, id }, createdBy: session?.user.id ?? null },
      baseVersion: operation === "CREATE" ? null : 1,
      createdAt: new Date().toISOString(),
      retryCount: 0
    }, registration.schoolId, deviceId);
    await refreshOfflineState();
    return { student: localStudent };
  }

  async function synchronize() {
    if (!session) return;
    const pending = await readPendingChanges();
    if (pending.length === 0) {
      showMessage("Nothing pending synchronization.");
      return;
    }
    try {
      const response = await api("/sync/push", {
        method: "POST",
        body: JSON.stringify({ deviceId, schoolId: session.user.schoolId, changes: pending })
      });
      const failedIds = new Set((response.results ?? []).filter((result: { status: string }) => !["SYNCED"].includes(result.status)).map((result: { id: string }) => result.id));
      const remaining = pending.filter((change: PendingChange) => failedIds.has(change.id)).map((change: PendingChange) => ({ ...change, retryCount: change.retryCount + 1 }));
      await writePendingChanges(remaining);
      if (remaining.length === 0) {
        await clearLocalStudents();
      }
      const now = new Date().toLocaleString();
      await persistLastSync(now);
      setLastSync(now);
      setPendingCount(remaining.length);
      await api("/sync/pull", {
        method: "POST",
        body: JSON.stringify({ deviceId, schoolId: session.user.schoolId, since: lastSync === "Never" ? null : new Date(lastSync).toISOString() })
      });
      await refreshAll();
      showMessage(remaining.length ? `${remaining.length} record(s) still need review.` : "Pending students synchronized successfully.");
    } catch (error) {
      setOnline(false);
      showError(error, "Synchronization failed. Please try again when the API is available.");
    }
  }

  async function resetPortal(student: Student) {
    const result = await api(`/students/${student.id}/reset-portal-credentials`, { method: "POST" });
    showMessage(`Portal reset for ${student.admissionNo}. Temporary password: ${result.temporaryPassword}`);
    await refreshAll();
  }

  const groupedSections = visibleSections.reduce<Array<{ group: AppSection["group"]; sections: AppSection[] }>>((groups, section) => {
    const existing = groups.find((item) => item.group === section.group);
    if (existing) {
      existing.sections.push(section);
    } else {
      groups.push({ group: section.group, sections: [section] });
    }
    return groups;
  }, []);

  if (!session) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">{schoolName}</p>
          <h1>Administration</h1>
          <UserIdentity displayName={session.user.displayName} roles={session.user.roles} workspace={roleWorkspaceName} school={schoolName} scope={workspaceScope?.title} />
        </div>
        <nav aria-label="Staff workspace navigation">
          {groupedSections.map((group) => (
            <div className="nav-group" key={group.group}>
              <span className="nav-group-label">{group.group}</span>
              {group.sections.map((section) => <button key={section.id} type="button" className={activeView === section.id ? "active" : ""} onClick={() => selectView(section.id)}>{section.label}</button>)}
            </div>
          ))}
        </nav>
        <button className="ghost" type="button" onClick={logout}>Logout</button>
      </aside>

      <section className="workspace">
        <header className="mobile-admin-bar">
          <div>
            <p className="eyebrow">{schoolName}</p>
            <strong>{session.user.displayName}</strong>
            <span>{roleWorkspaceName}</span>
          </div>
          <button className="ghost" type="button" onClick={logout}>Logout</button>
        </header>
        <header className="topbar">
          <div>
            <p className="eyebrow">{schoolName}</p>
            <h2>{activeView === "dashboard" ? `${roleWorkspaceName} Dashboard` : viewTitle(activeView)}</h2>
            {persona && <p className="role-caption">{persona.title} - {persona.summary}</p>}
          </div>
          <UserIdentity displayName={session.user.displayName} roles={session.user.roles} workspace={roleWorkspaceName} school={schoolName} scope={workspaceScope?.title} />
          <div className="status-strip">
            <span className={online ? "status online" : "status offline"}>{online ? "Online" : "Offline"}</span>
            <span>{pendingCount} pending</span>
            <span>Last sync: {lastSync}</span>
            <button type="button" onClick={synchronize}>Sync</button>
          </div>
        </header>

        <div className="mobile-section-nav">
          <label>
            Section
            <select value={activeView} onChange={(event) => selectView(event.target.value as ActiveView)}>
              {visibleSections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
            </select>
          </label>
        </div>

        {persona && activeView === "dashboard" && (
          <RoleHomeCard
            persona={persona}
            sections={visibleSections}
            scope={workspaceScope}
            setActiveView={selectView}
            applyStudentFilter={(filter) => {
              setFilters((current) => ({ ...current, classId: filter.classId, streamId: filter.streamId ?? "" }));
              selectView("students");
            }}
          />
        )}

        <AppNotice message={message} error={errorNotice} />

        <section className="config-band">
          <div><strong>Academic year</strong><span>{config?.academicYears.find((year) => year.id === config.school.currentAcademicYearId)?.name ?? "Not set"}</span></div>
          <div><strong>Current term</strong><span>{config?.academicYears.flatMap((year) => year.terms).find((term) => term.id === config.school.currentTermId)?.name ?? "Not set"}</span></div>
          {financeOnly ? (
            <>
              <div><strong>Fee currency</strong><span>UGX</span></div>
              <div><strong>Student accounts</strong><span>{visibleStudents.length}</span></div>
            </>
          ) : (
            <>
              <div><strong>Classes</strong><span>{config?.classes.length ?? 0}</span></div>
              <div><strong>Subjects</strong><span>{config?.subjects.length ?? 0}</span></div>
            </>
          )}
        </section>

        {!activeViewPermitted ? (
          <PermissionDeniedState sectionName={activeSection?.label} />
        ) : visibleSections.length === 0 ? (
          <PermissionDeniedState sectionName="No sections available" />
        ) : activeView === "dashboard" ? (
          <DashboardView api={api} session={session} online={online} pendingCount={pendingCount} lastSync={lastSync} setMessage={showMessage} />
        ) : activeView === "academics" ? (
          <AcademicsAdminView api={api} config={config} session={session} scope={workspaceScope} setMessage={showMessage} />
        ) : activeView === "timetable" ? (
          <TimetableAdminView api={api} config={config} scope={workspaceScope} setMessage={showMessage} />
        ) : activeView === "finance" ? (
          <FinanceView api={api} config={config} students={visibleStudents} session={session} online={online} refreshOfflineState={refreshOfflineState} setMessage={showMessage} />
        ) : activeView === "budgets" ? (
          <BudgetsView api={api} config={config} session={session} online={online} refreshOfflineState={refreshOfflineState} setMessage={showMessage} />
        ) : activeView === "inventory" ? (
          <InventoryAdminView api={api} setMessage={showMessage} />
        ) : activeView === "payroll" ? (
          <PayrollAdminView api={api} setMessage={showMessage} />
        ) : activeView === "notifications" ? (
          <NotificationsAdminView api={api} setMessage={showMessage} />
        ) : activeView === "approvals" ? (
          <ApprovalsView api={api} setMessage={showMessage} />
        ) : activeView === "users" ? (
          <UsersRolesView api={api} session={session} setMessage={showMessage} />
        ) : activeView === "risk" ? (
          <RiskAlertsView api={api} setMessage={showMessage} />
        ) : activeView === "school" ? (
          <SchoolConfigView config={config} api={api} refreshAll={refreshAll} setMessage={showMessage} />
        ) : activeView === "attendance" ? (
          <AttendanceView api={api} setMessage={showMessage} />
        ) : activeView === "sync" ? (
          <SyncReviewView api={api} setMessage={showMessage} />
        ) : activeView === "audit" ? (
          <AuditView api={api} />
        ) : <>
        {workspaceScope?.studentFilters.length ? (
          <WorkspaceScopePanel
            summary={workspaceScope}
            onStudentFilter={(filter) => setFilters((current) => ({ ...current, classId: filter.classId, streamId: filter.streamId ?? "" }))}
          />
        ) : null}
        {workspaceScope?.studentFilters.length ? (
          <RosterImportPreview api={api} scope={workspaceScope} setMessage={showMessage} />
        ) : null}
        <section className="content-grid">
          <section className="list-pane">
            <div className="filters">
              <input placeholder="Search admission no. or name" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
              <select value={filters.classId} onChange={(event) => setFilters({ ...filters, classId: event.target.value })}>
                <option value="">All classes</option>
                {config?.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="APPLICANT">Applicant</option>
                <option value="INACTIVE">Inactive</option>
                <option value="GRADUATED">Graduated</option>
              </select>
              <button onClick={refreshAll}>Refresh</button>
            </div>

            <DataTable label="Student records">
              <thead><tr><th>Admission</th><th>Name</th><th>Class</th><th>Status</th><th>Sync</th></tr></thead>
              <tbody>
                {visibleStudents.map((student) => (
                  <tr
                    key={student.id}
                    className="clickable-row"
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${student.firstName} ${student.lastName}`}
                    onClick={() => { setSelected(student); setForm(fromStudent(student, config)); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(student);
                        setForm(fromStudent(student, config));
                      }
                    }}
                  >
                    <td>{student.admissionNo}</td>
                    <td>{student.firstName} {student.lastName}</td>
                    <td>{student.currentClass?.name ?? config?.classes.find((item) => item.id === student.currentClassId)?.name ?? "-"}</td>
                    <td><span className="pill">{student.status}</span></td>
                    <td>{student.syncStatus ?? "SYNCED"}</td>
                  </tr>
                ))}
                {visibleStudents.length === 0 && <tr><td colSpan={5} className="empty">No students match the current filters.</td></tr>}
              </tbody>
            </DataTable>
          </section>

          <section className="detail-pane">
            {selected ? (
              <StudentProfile student={selected} canResetPortal={canManageStudents} onReset={() => resetPortal(selected)} />
            ) : (
              <div className="empty-state"><h3>No student selected</h3><p>Select a student to view profile, guardian details, portal account and promotion history.</p></div>
            )}
          </section>
        </section>

        {canManageStudents ? (
          <section className="form-band">
            <div className="section-heading">
              <h3>{selected ? "Edit Student" : "Register Student"}</h3>
              {selected && <button className="ghost" type="button" onClick={() => { setSelected(null); setForm(emptyForm); }}>New registration</button>}
            </div>
            <StudentForm form={form} setForm={setForm} config={config} onSubmit={submitStudent} />
          </section>
        ) : (
          <section className="form-band muted-panel">
            <h3>Read-only student records</h3>
            <p>{financeOnly ? "The bursar can view student fee accounts from Finance. Student details are maintained by the Dean of Studies." : "Student admissions, edits and promotions are maintained by the Dean of Studies."}</p>
          </section>
        )}
        </>}
      </section>
    </main>
  );
}

function LoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState(demoMode ? "admin@aethina.test" : "");
  const [password, setPassword] = useState(demoMode ? "AdminPass123" : "");
  const [error, setError] = useState("");
  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={async (event) => { event.preventDefault(); setError(""); try { await onLogin(email, password); } catch { setError("Check your email and password."); } }}>
        <p className="eyebrow">Satelite Secondary</p>
        <h1>Sign in</h1>
        <p className="login-copy">Admin, bursar, teacher, attendance kiosk, finance, academics, inventory, payroll, approvals, and offline sync.</p>
        {demoMode && <div className="demo-strip">Demo admin: admin@aethina.test / AdminPass123</div>}
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Login</button>
      </form>
    </main>
  );
}

function RoleHomeCard({
  persona,
  sections,
  scope,
  setActiveView,
  applyStudentFilter
}: {
  persona: Persona;
  sections: AppSection[];
  scope: WorkspaceScopeSummary | null;
  setActiveView: (view: ActiveView) => void;
  applyStudentFilter: (filter: StudentQuickFilter) => void;
}) {
  const workspace = roleWorkspaceFor(persona, sections);
  return (
    <section className="role-home role-workspace">
      <div className="role-intro">
        <div>
          <p className="eyebrow">{persona.kicker}</p>
          <h3>{persona.title}</h3>
          <p>{persona.summary}</p>
        </div>
        <div className="role-actions">
          {workspace.actions.map((action) => <button key={action.view} type="button" className="ghost" onClick={() => setActiveView(action.view)}>{action.label}</button>)}
        </div>
      </div>

      {scope && <WorkspaceScopePanel summary={scope} onStudentFilter={applyStudentFilter} />}

      <div className="role-workspace-compact">
        <section className="role-focus-panel role-primary-panel">
          <h4>Primary Workspace</h4>
          <div className="role-focus-list">
            {workspace.focus.map((item) => (
              <button key={item.view} type="button" className="role-focus-card" onClick={() => setActiveView(item.view)}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>
        </section>
        <details className="role-focus-panel role-note-panel">
          <summary>Daily Routine</summary>
          <ul className="role-check-list">{workspace.routines.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
        <details className="role-focus-panel role-note-panel">
          <summary>Watch Points</summary>
          <ul className="role-check-list attention">{workspace.alerts.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      </div>
    </section>
  );
}

function WorkspaceScopePanel({ summary, onStudentFilter }: { summary: WorkspaceScopeSummary; onStudentFilter?: (filter: StudentQuickFilter) => void }) {
  return (
    <section className="workspace-scope-panel" aria-label="Workspace ownership">
      <div>
        <p className="eyebrow">Workspace ownership</p>
        <h4>{summary.title}</h4>
        <p>{summary.description}</p>
      </div>
      <div className="workspace-scope-chips">
        {summary.chips.map((chip) => <span key={chip} className="scope-chip">{chip}</span>)}
      </div>
      {onStudentFilter && summary.studentFilters.length > 0 && (
        <div className="scope-filter-row">
          {summary.studentFilters.slice(0, 6).map((filter) => (
            <button key={`${filter.classId}-${filter.streamId ?? "all"}`} type="button" className="ghost" onClick={() => onStudentFilter(filter)}>
              {filter.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function StudentProfile({ student, canResetPortal, onReset }: { student: Student; canResetPortal: boolean; onReset: () => void }) {
  const guardian = student.guardians?.[0];
  return (
    <div className="profile">
      <div className="profile-header">
        <div className="avatar">{student.firstName.slice(0, 1)}{student.lastName.slice(0, 1)}</div>
        <div>
          <h3>{student.firstName} {student.middleName} {student.lastName}</h3>
          <p>{student.admissionNo}</p>
        </div>
      </div>
      <dl className="profile-details">
        <dt>Guardian</dt><dd>{guardian?.guardian.fullName ?? "-"}</dd>
        <dt>Relationship</dt><dd>{guardian?.relationship ?? "-"}</dd>
        <dt>Phone</dt><dd>{guardian?.guardian.phone ?? "-"}</dd>
        <dt>Email</dt><dd>{guardian?.guardian.email ?? "-"}</dd>
        <dt>Emergency</dt><dd>{student.emergencyContact ?? "-"}</dd>
        <dt>Medical</dt><dd>{student.medicalNotes ?? "None"}</dd>
        <dt>Portal</dt><dd>{student.portalCredential?.username ?? "Pending"}</dd>
      </dl>
      {canResetPortal && <button onClick={onReset}>Reset Portal Credentials</button>}
      <h4>Promotion History</h4>
      <ul className="history">
        {(student.promotions ?? []).map((promotion) => <li key={promotion.id}>{new Date(promotion.promotionDate).toLocaleDateString()} to class {promotion.newClassId}</li>)}
        {(student.promotions ?? []).length === 0 && <li>No promotions recorded.</li>}
      </ul>
    </div>
  );
}

function StudentForm({ form, setForm, config, onSubmit }: { form: RegistrationForm; setForm: (form: RegistrationForm) => void; config: SchoolConfig | null; onSubmit: (event: React.FormEvent) => void }) {
  const selectedClass = config?.classes.find((item) => item.id === form.currentClassId);
  const update = (key: keyof RegistrationForm, value: string) => setForm({ ...form, [key]: value });
  return (
    <form className="student-form" onSubmit={onSubmit}>
      <fieldset className="student-form-section">
        <legend>Student Details</legend>
        <label>Admission No.<input value={form.admissionNo} onChange={(event) => update("admissionNo", event.target.value)} placeholder="Auto if blank" /></label>
        <label>First name<input required value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label>
        <label>Middle name<input value={form.middleName} onChange={(event) => update("middleName", event.target.value)} /></label>
        <label>Last name<input required value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label>
        <label>Gender<select value={form.gender} onChange={(event) => update("gender", event.target.value)}><option>FEMALE</option><option>MALE</option><option>OTHER</option></select></label>
        <label>Date of birth<input type="date" value={form.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label>
      </fieldset>
      <fieldset className="student-form-section">
        <legend>Placement</legend>
        <label>Academic year<select value={form.currentAcademicYearId} onChange={(event) => update("currentAcademicYearId", event.target.value)}>{config?.academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
        <label>Class<select required value={form.currentClassId} onChange={(event) => update("currentClassId", event.target.value)}>{config?.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Stream<select value={form.currentStreamId} onChange={(event) => update("currentStreamId", event.target.value)}><option value="">None</option>{selectedClass?.streams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Admission date<input type="date" value={form.admissionDate} onChange={(event) => update("admissionDate", event.target.value)} /></label>
        <label>Status<select value={form.status} onChange={(event) => update("status", event.target.value)}><option>ACTIVE</option><option>APPLICANT</option><option>INACTIVE</option><option>GRADUATED</option></select></label>
        <label>Previous school<input value={form.previousSchool} onChange={(event) => update("previousSchool", event.target.value)} /></label>
      </fieldset>
      <fieldset className="student-form-section">
        <legend>Guardian & Contacts</legend>
        <label>Guardian name<input required value={form.guardianFullName} onChange={(event) => update("guardianFullName", event.target.value)} /></label>
        <label>Relationship<input required value={form.guardianRelationship} onChange={(event) => update("guardianRelationship", event.target.value)} /></label>
        <label>Guardian phone<input required value={form.guardianPhone} onChange={(event) => update("guardianPhone", event.target.value)} /></label>
        <label>Guardian email<input type="email" value={form.guardianEmail} onChange={(event) => update("guardianEmail", event.target.value)} /></label>
        <label>Guardian address<input value={form.guardianAddress} onChange={(event) => update("guardianAddress", event.target.value)} /></label>
        <label>Emergency contact<input required value={form.emergencyContact} onChange={(event) => update("emergencyContact", event.target.value)} /></label>
      </fieldset>
      <fieldset className="student-form-section wide">
        <legend>Records</legend>
        <label>Photo URL<input value={form.photoUrl} onChange={(event) => update("photoUrl", event.target.value)} /></label>
        <label>Document URLs<input value={form.supportingDocuments} onChange={(event) => update("supportingDocuments", event.target.value)} placeholder="Comma-separated URLs" /></label>
        <label>Medical notes<textarea value={form.medicalNotes} onChange={(event) => update("medicalNotes", event.target.value)} /></label>
        <label>Notes<textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
      </fieldset>
      <button type="submit">Save Student</button>
    </form>
  );
}

function RosterImportPreview({ api, scope, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; scope: WorkspaceScopeSummary; setMessage: (message: string) => void }) {
  const [scopeKey, setScopeKey] = useState(() => rosterScopeKey(scope.studentFilters[0]));
  const [rawRows, setRawRows] = useState("");
  const [preview, setPreview] = useState<RosterPreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedScope = scope.studentFilters.find((filter) => rosterScopeKey(filter) === scopeKey) ?? scope.studentFilters[0];
  const parsedRows = parseRosterRows(rawRows);
  const canPreview = Boolean(selectedScope && parsedRows.length > 0 && !busy);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedScope || parsedRows.length === 0) {
      setMessage("Choose an assigned class and paste at least one roster row.");
      return;
    }
    setBusy(true);
    try {
      const result = await api("/students/roster-import/preview", {
        method: "POST",
        body: JSON.stringify({ classId: selectedScope.classId, streamId: selectedScope.streamId ?? null, rows: parsedRows })
      });
      setPreview(result);
      setMessage(`Roster preview checked ${result.totalRows} row${result.totalRows === 1 ? "" : "s"}. No student records were created.`);
    } catch (error) {
      setMessage(userMessage(error, "Roster preview failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="operation-panel wide-panel roster-preview-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Class roster preparation</p>
          <h3>Import Preview</h3>
          <p className="panel-copy">Paste a class list to check names, duplicate admission numbers, and assignment scope before DOS registration.</p>
        </div>
        {preview && <span className="pill">Preview only</span>}
      </div>
      <form className="roster-preview-form" onSubmit={(event) => void submit(event)}>
        <label>
          Assigned class
          <select value={scopeKey} onChange={(event) => setScopeKey(event.target.value)}>
            {scope.studentFilters.map((filter) => <option key={rosterScopeKey(filter)} value={rosterScopeKey(filter)}>{filter.label}</option>)}
          </select>
        </label>
        <label className="wide">
          Roster rows
          <textarea
            value={rawRows}
            onChange={(event) => setRawRows(event.target.value)}
            placeholder={"admissionNo, firstName, lastName, middleName\nSAT-S1-041, Amina, Kato\nSAT-S1-042, Brian, Ocen"}
            rows={5}
          />
        </label>
        <div className="roster-preview-actions">
          <span>{parsedRows.length} parsed row{parsedRows.length === 1 ? "" : "s"}</span>
          <button type="submit" disabled={!canPreview}>{busy ? "Checking..." : "Preview roster"}</button>
        </div>
      </form>
      {preview && (
        <>
          <div className="summary-strip">
            <span><strong>{preview.totalRows}</strong>Rows checked</span>
            <span><strong>{preview.validRows.length}</strong>Ready rows</span>
            <span><strong>{preview.errors.length}</strong>Rows needing edits</span>
            <span><strong>{preview.existingMatches.length}</strong>Existing matches</span>
          </div>
          <DataTable label="Roster preview results" compact>
            <thead><tr><th>Row</th><th>Admission</th><th>Name</th><th>Status</th></tr></thead>
            <tbody>
              {preview.validRows.map((row, index) => {
                const match = row.admissionNo ? preview.existingMatches.find((item) => item.row.admissionNo === row.admissionNo) : undefined;
                return <tr key={`${row.admissionNo ?? row.firstName}-${index}`}><td>{index + 1}</td><td>{row.admissionNo ?? "Not provided"}</td><td>{row.firstName} {row.middleName ?? ""} {row.lastName}</td><td><span className="pill">{match ? "Existing student" : "Ready for DOS review"}</span></td></tr>;
              })}
              {preview.errors.map((error) => <tr key={`error-${error.rowNumber}`}><td>{error.rowNumber}</td><td>{error.row.admissionNo ?? "Not provided"}</td><td>{error.row.firstName} {error.row.lastName}</td><td>{error.messages.join(" ")}</td></tr>)}
              {preview.totalRows === 0 && <tr><td colSpan={4} className="empty">No roster rows were parsed.</td></tr>}
            </tbody>
          </DataTable>
          <p className="panel-copy">{preview.nextStep}</p>
        </>
      )}
    </section>
  );
}

function SchoolConfigView({ config, api, refreshAll, setMessage }: { config: SchoolConfig | null; api: (path: string, init?: RequestInit) => Promise<any>; refreshAll: () => Promise<void>; setMessage: (message: string) => void }) {
  const [profile, setProfile] = useState({ name: "", code: "", phone: "", email: "", address: "", admissionNumberPrefix: "AET" });
  const [academicYear, setAcademicYear] = useState({ name: "", startsAt: "2026-01-01", endsAt: "2026-12-31", isActive: true });
  const [term, setTerm] = useState({ academicYearId: "", name: "Term 1", startsAt: "2026-01-01", endsAt: "2026-04-30", isCurrent: true });
  const [classForm, setClassForm] = useState({ name: "", level: "1" });
  const [stream, setStream] = useState({ classId: "", name: "" });
  const [subject, setSubject] = useState({ code: "", name: "" });
  const [subjectAssignment, setSubjectAssignment] = useState({ teacherId: "", subjectId: "", classId: "", streamId: "" });
  const [classTeacherAssignment, setClassTeacherAssignment] = useState({ teacherId: "", classId: "", streamId: "", academicYearId: "", termId: "" });
  const [boundary, setBoundary] = useState({ grade: "", minScore: "0", maxScore: "100", remark: "" });

  useEffect(() => {
    if (!config) return;
    setProfile({
      name: config.school.name ?? "",
      code: config.school.code ?? "",
      phone: config.school.phone ?? "",
      email: config.school.email ?? "",
      address: config.school.address ?? "",
      admissionNumberPrefix: config.school.admissionNumberPrefix ?? "AET"
    });
    setTerm((current) => ({ ...current, academicYearId: current.academicYearId || config.school.currentAcademicYearId || config.academicYears[0]?.id || "" }));
    setStream((current) => ({ ...current, classId: current.classId || config.classes[0]?.id || "" }));
    setSubjectAssignment((current) => ({
      ...current,
      teacherId: current.teacherId || config.teachers?.[0]?.id || "",
      subjectId: current.subjectId || config.subjects[0]?.id || "",
      classId: current.classId || config.classes[0]?.id || "",
      streamId: current.streamId || config.classes[0]?.streams[0]?.id || ""
    }));
    setClassTeacherAssignment((current) => ({
      ...current,
      teacherId: current.teacherId || config.teachers?.[0]?.id || "",
      classId: current.classId || config.classes[0]?.id || "",
      streamId: current.streamId || config.classes[0]?.streams[0]?.id || "",
      academicYearId: current.academicYearId || config.school.currentAcademicYearId || config.academicYears[0]?.id || "",
      termId: current.termId || config.school.currentTermId || config.academicYears[0]?.terms[0]?.id || ""
    }));
  }, [config]);

  async function submit(path: string, body: Record<string, unknown>, success: string) {
    try {
      await api(path, { method: path === "/school-config/profile" ? "PUT" : "POST", body: JSON.stringify(withIsoDates(body)) });
      setMessage(success);
      await refreshAll();
    } catch (error) {
      setMessage(userMessage(error, "Configuration update failed."));
    }
  }

  if (!config) {
    return <div className="empty-state"><h3>Configuration unavailable</h3><p>Start the API to manage school setup records.</p></div>;
  }

  return (
    <section className="setup-grid">
      <form className="setup-panel wide-panel" onSubmit={(event) => { event.preventDefault(); void submit("/school-config/profile", profile, "School profile updated."); }}>
        <div className="section-heading"><h3>School Profile</h3><button type="submit">Save</button></div>
        <div className="setup-form profile-form">
          <label>Name<input required value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
          <label>Code<input required value={profile.code} onChange={(event) => setProfile({ ...profile, code: event.target.value })} /></label>
          <label>Phone<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
          <label>Email<input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label>
          <label>Admission prefix<input value={profile.admissionNumberPrefix} onChange={(event) => setProfile({ ...profile, admissionNumberPrefix: event.target.value })} /></label>
          <label className="wide">Address<textarea value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} /></label>
        </div>
      </form>

      <form className="setup-panel" onSubmit={(event) => { event.preventDefault(); void submit("/school-config/academic-years", academicYear, "Academic year created."); }}>
        <div className="section-heading"><h3>Academic Years</h3><button type="submit">Add</button></div>
        <div className="setup-form">
          <label>Name<input required value={academicYear.name} onChange={(event) => setAcademicYear({ ...academicYear, name: event.target.value })} placeholder="2027" /></label>
          <label>Starts<input type="date" value={academicYear.startsAt} onChange={(event) => setAcademicYear({ ...academicYear, startsAt: event.target.value })} /></label>
          <label>Ends<input type="date" value={academicYear.endsAt} onChange={(event) => setAcademicYear({ ...academicYear, endsAt: event.target.value })} /></label>
          <label className="check-row"><input type="checkbox" checked={academicYear.isActive} onChange={(event) => setAcademicYear({ ...academicYear, isActive: event.target.checked })} /> Active year</label>
        </div>
        <ConfigList items={config.academicYears.map((item) => `${item.name}${item.isActive ? " active" : ""}`)} />
      </form>

      <form className="setup-panel" onSubmit={(event) => { event.preventDefault(); void submit("/school-config/terms", term, "Term created."); }}>
        <div className="section-heading"><h3>Terms</h3><button type="submit">Add</button></div>
        <div className="setup-form">
          <label>Academic year<select value={term.academicYearId} onChange={(event) => setTerm({ ...term, academicYearId: event.target.value })}>{config.academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
          <label>Name<input required value={term.name} onChange={(event) => setTerm({ ...term, name: event.target.value })} /></label>
          <label>Starts<input type="date" value={term.startsAt} onChange={(event) => setTerm({ ...term, startsAt: event.target.value })} /></label>
          <label>Ends<input type="date" value={term.endsAt} onChange={(event) => setTerm({ ...term, endsAt: event.target.value })} /></label>
          <label className="check-row"><input type="checkbox" checked={term.isCurrent} onChange={(event) => setTerm({ ...term, isCurrent: event.target.checked })} /> Current term</label>
        </div>
        <ConfigList items={config.academicYears.flatMap((year) => year.terms.map((item) => `${year.name}: ${item.name}${item.isCurrent ? " current" : ""}`))} />
      </form>

      <form className="setup-panel" onSubmit={(event) => { event.preventDefault(); void submit("/school-config/classes", { name: classForm.name, level: Number(classForm.level) }, "Class created."); }}>
        <div className="section-heading"><h3>Classes</h3><button type="submit">Add</button></div>
        <div className="setup-form two-col">
          <label>Name<input required value={classForm.name} onChange={(event) => setClassForm({ ...classForm, name: event.target.value })} /></label>
          <label>Level<input required type="number" min="1" value={classForm.level} onChange={(event) => setClassForm({ ...classForm, level: event.target.value })} /></label>
        </div>
        <ConfigList items={config.classes.map((item) => `${item.name} (${item.streams.length} streams)`)} />
      </form>

      <form className="setup-panel" onSubmit={(event) => { event.preventDefault(); void submit("/school-config/streams", stream, "Stream created."); }}>
        <div className="section-heading"><h3>Streams</h3><button type="submit">Add</button></div>
        <div className="setup-form two-col">
          <label>Class<select value={stream.classId} onChange={(event) => setStream({ ...stream, classId: event.target.value })}>{config.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Name<input required value={stream.name} onChange={(event) => setStream({ ...stream, name: event.target.value })} /></label>
        </div>
        <ConfigList items={config.classes.flatMap((item) => item.streams.map((streamItem) => `${item.name}: ${streamItem.name}`))} />
      </form>

      <form className="setup-panel" onSubmit={(event) => { event.preventDefault(); void submit("/school-config/subjects", subject, "Subject created."); }}>
        <div className="section-heading"><h3>Subjects</h3><button type="submit">Add</button></div>
        <div className="setup-form two-col">
          <label>Code<input required value={subject.code} onChange={(event) => setSubject({ ...subject, code: event.target.value.toUpperCase() })} /></label>
          <label>Name<input required value={subject.name} onChange={(event) => setSubject({ ...subject, name: event.target.value })} /></label>
        </div>
        <ConfigList items={config.subjects.map((item) => `${item.code} - ${item.name}`)} />
      </form>

      <form className="setup-panel" onSubmit={(event) => { event.preventDefault(); void submit("/school-config/teacher-subject-assignments", { ...subjectAssignment, streamId: subjectAssignment.streamId || null }, "Teacher subject allocation saved."); }}>
        <div className="section-heading"><h3>Subject Allocation</h3><button type="submit">Assign</button></div>
        <div className="setup-form">
          <label>Teacher<select value={subjectAssignment.teacherId} onChange={(event) => setSubjectAssignment({ ...subjectAssignment, teacherId: event.target.value })}>{config.teachers?.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}</select></label>
          <label>Subject<select value={subjectAssignment.subjectId} onChange={(event) => setSubjectAssignment({ ...subjectAssignment, subjectId: event.target.value })}>{config.subjects.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></label>
          <label>Class<select value={subjectAssignment.classId} onChange={(event) => setSubjectAssignment({ ...subjectAssignment, classId: event.target.value, streamId: config.classes.find((item) => item.id === event.target.value)?.streams[0]?.id || "" })}>{config.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Stream<select value={subjectAssignment.streamId} onChange={(event) => setSubjectAssignment({ ...subjectAssignment, streamId: event.target.value })}><option value="">Whole class</option>{config.classes.find((item) => item.id === subjectAssignment.classId)?.streams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <ConfigList items={(config.teacherSubjectAssignments ?? []).map((item) => `${item.teacher?.firstName ?? "Teacher"} ${item.teacher?.lastName ?? ""}: ${config.subjects.find((subject) => subject.id === item.subjectId)?.name ?? item.subjectId}`)} />
      </form>

      <form className="setup-panel" onSubmit={(event) => { event.preventDefault(); void submit("/school-config/class-teacher-assignments", { ...classTeacherAssignment, streamId: classTeacherAssignment.streamId || null, termId: classTeacherAssignment.termId || null }, "Class teacher allocation saved."); }}>
        <div className="section-heading"><h3>Class Teachers</h3><button type="submit">Assign</button></div>
        <div className="setup-form">
          <label>Teacher<select value={classTeacherAssignment.teacherId} onChange={(event) => setClassTeacherAssignment({ ...classTeacherAssignment, teacherId: event.target.value })}>{config.teachers?.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}</select></label>
          <label>Class<select value={classTeacherAssignment.classId} onChange={(event) => setClassTeacherAssignment({ ...classTeacherAssignment, classId: event.target.value, streamId: config.classes.find((item) => item.id === event.target.value)?.streams[0]?.id || "" })}>{config.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Stream<select value={classTeacherAssignment.streamId} onChange={(event) => setClassTeacherAssignment({ ...classTeacherAssignment, streamId: event.target.value })}><option value="">Whole class</option>{config.classes.find((item) => item.id === classTeacherAssignment.classId)?.streams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Academic year<select value={classTeacherAssignment.academicYearId} onChange={(event) => setClassTeacherAssignment({ ...classTeacherAssignment, academicYearId: event.target.value })}>{config.academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
          <label>Term<select value={classTeacherAssignment.termId} onChange={(event) => setClassTeacherAssignment({ ...classTeacherAssignment, termId: event.target.value })}><option value="">All terms</option>{config.academicYears.flatMap((year) => year.terms).map((termItem) => <option key={termItem.id} value={termItem.id}>{termItem.name}</option>)}</select></label>
        </div>
        <ConfigList items={(config.classTeacherAssignments ?? []).map((item) => `${item.teacher?.firstName ?? "Teacher"} ${item.teacher?.lastName ?? ""}: ${item.class?.name ?? item.classId}${item.stream ? ` ${item.stream.name}` : ""}`)} />
      </form>

      <form className="setup-panel" onSubmit={(event) => { event.preventDefault(); void submit("/school-config/grade-boundaries", { ...boundary, minScore: Number(boundary.minScore), maxScore: Number(boundary.maxScore) }, "Grade boundary created."); }}>
        <div className="section-heading"><h3>Grade Boundaries</h3><button type="submit">Add</button></div>
        <div className="setup-form two-col">
          <label>Grade<input required value={boundary.grade} onChange={(event) => setBoundary({ ...boundary, grade: event.target.value.toUpperCase() })} /></label>
          <label>Min<input type="number" value={boundary.minScore} onChange={(event) => setBoundary({ ...boundary, minScore: event.target.value })} /></label>
          <label>Max<input type="number" value={boundary.maxScore} onChange={(event) => setBoundary({ ...boundary, maxScore: event.target.value })} /></label>
          <label>Remark<input value={boundary.remark} onChange={(event) => setBoundary({ ...boundary, remark: event.target.value })} /></label>
        </div>
        <ConfigList items={config.gradeBoundaries.map((item) => `${item.grade}: ${item.minScore}-${item.maxScore}`)} />
      </form>
    </section>
  );
}

function AttendanceView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<AttendanceRecord[]>([]);

  async function load() {
    const [dayRows, pendingRows] = await Promise.all([
      api(`/teacher-attendance?date=${encodeURIComponent(date)}`),
      api("/teacher-attendance/correction-requests")
    ]);
    setRecords(asArray<AttendanceRecord>(dayRows));
    setCorrections(asArray<AttendanceRecord>(pendingRows));
  }

  useEffect(() => {
    void load().catch((error) => setMessage(userMessage(error, "Could not load attendance.")));
  }, [date]);

  async function review(id: string, action: "approve" | "reject") {
    await api(`/teacher-attendance/${id}/${action}-correction`, { method: "POST", body: JSON.stringify({ reason: "Reviewed by administrator" }) });
    setMessage(`Correction ${action === "approve" ? "approved" : "rejected"}.`);
    await load();
  }

  return (
    <section className="operations-grid">
      <section className="operation-panel">
        <div className="section-heading"><h3>Kiosk</h3><button type="button" onClick={() => void load()}>Refresh</button></div>
        <TeacherAttendanceKiosk />
      </section>
      <section className="operation-panel">
        <div className="section-heading">
          <h3>Daily Register</h3>
          <input className="compact-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <AttendanceTable records={records} />
      </section>
      <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Correction Requests</h3><span className="pill">{corrections.length} pending</span></div>
        <DataTable label="Teacher attendance correction requests">
          <thead><tr><th>Teacher</th><th>Reason</th><th>Requested</th><th>Decision</th></tr></thead>
          <tbody>
            {corrections.map((record) => (
              <tr key={record.id}>
                <td>{record.teacher.staffId} {record.teacher.firstName} {record.teacher.lastName}</td>
                <td>{record.correctionReason ?? "-"}</td>
                <td>{formatTime(record.requestedCheckInAt)} / {formatTime(record.requestedCheckOutAt)}</td>
                <td className="row-actions">
                  <button type="button" onClick={() => void review(record.id, "approve")}>Approve</button>
                  <button className="ghost" type="button" onClick={() => void review(record.id, "reject")}>Reject</button>
                </td>
              </tr>
            ))}
            {corrections.length === 0 && <tr><td colSpan={4} className="empty">No correction requests waiting for review.</td></tr>}
          </tbody>
        </DataTable>
      </section>
    </section>
  );
}

function AttendanceTable({ records }: { records: AttendanceRecord[] }) {
  return (
    <DataTable label="Teacher attendance daily register">
      <thead><tr><th>Staff</th><th>Teacher</th><th>In</th><th>Out</th><th>Status</th></tr></thead>
      <tbody>
        {records.map((record) => (
          <tr key={record.id}>
            <td>{record.teacher.staffId}</td>
            <td>{record.teacher.firstName} {record.teacher.lastName}</td>
            <td>{formatTime(record.checkInAt)}</td>
            <td>{formatTime(record.checkOutAt)}</td>
            <td><span className="pill">{record.status}</span></td>
          </tr>
        ))}
        {records.length === 0 && <tr><td colSpan={5} className="empty">No teacher attendance recorded for this date.</td></tr>}
      </tbody>
    </DataTable>
  );
}

function SyncReviewView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);

  async function load() {
    setConflicts(asArray<SyncConflictRecord>(await api("/sync/conflicts")));
  }

  useEffect(() => {
    void load().catch((error) => setMessage(userMessage(error, "Could not load sync conflicts.")));
  }, []);

  async function decide(id: string, action: "resolve" | "reject") {
    await api(`/sync/conflicts/${id}/${action}`, { method: "POST", body: "{}" });
    setMessage(`Sync conflict ${action === "resolve" ? "resolved" : "rejected"}.`);
    await load();
  }

  return (
    <section className="operation-panel">
      <div className="section-heading"><h3>Synchronization Conflicts</h3><button type="button" onClick={() => void load()}>Refresh</button></div>
      <DataTable label="Synchronization conflicts">
        <thead><tr><th>Entity</th><th>Versions</th><th>Sensitivity</th><th>Reason</th><th>Decision</th></tr></thead>
        <tbody>
          {conflicts.map((conflict) => (
            <tr key={conflict.id}>
              <td>{conflict.entityType}<br /><small>{conflict.entityId}</small></td>
              <td>{conflict.localVersion} / {conflict.serverVersion}</td>
              <td><span className="pill">{conflict.sensitivity}</span></td>
              <td>{conflict.reason}</td>
              <td className="row-actions">
                <button type="button" onClick={() => void decide(conflict.id, "resolve")}>Resolve</button>
                <button className="ghost" type="button" onClick={() => void decide(conflict.id, "reject")}>Reject</button>
              </td>
            </tr>
          ))}
          {conflicts.length === 0 && <tr><td colSpan={5} className="empty">No open synchronization conflicts.</td></tr>}
        </tbody>
      </DataTable>
    </section>
  );
}

function AuditView({ api }: { api: (path: string, init?: RequestInit) => Promise<any> }) {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [records, setRecords] = useState<AuditRecord[]>([]);

  async function load() {
    const query = new URLSearchParams(stripEmpty({ action, entityType, take: "75" }));
    setRecords(asArray<AuditRecord>(await api(`/audit?${query.toString()}`)));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="operation-panel">
      <div className="filters audit-filters">
        <input placeholder="Filter action" value={action} onChange={(event) => setAction(event.target.value)} />
        <input placeholder="Entity type" value={entityType} onChange={(event) => setEntityType(event.target.value.toUpperCase())} />
        <button type="button" onClick={() => void load()}>Search</button>
      </div>
      <DataTable label="Audit log events">
        <thead><tr><th>Time</th><th>Event</th><th>Module</th><th>Actor</th></tr></thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{new Date(record.createdAt).toLocaleString()}</td>
              <td>
                {formatAuditAction(record.action)}
                <details className="row-details">
                  <summary>Details</summary>
                  <small>Action: {record.action}</small><br />
                  <small>Record: {record.entityId}</small>
                </details>
              </td>
              <td>{formatEntityName(record.entityType)}</td>
              <td>{record.actorId ? "Staff user" : "System"}</td>
            </tr>
          ))}
          {records.length === 0 && <tr><td colSpan={4} className="empty">No audit events match the current filters.</td></tr>}
        </tbody>
      </DataTable>
    </section>
  );
}

function ConfigList({ items }: { items: string[] }) {
  return (
    <ul className="config-list">
      {items.slice(0, 8).map((item) => <li key={item}>{item}</li>)}
      {items.length === 0 && <li>No setup records have been added.</li>}
    </ul>
  );
}

function toRegistration(form: RegistrationForm, schoolId: string) {
  const isoDate = (value: string) => new Date(value).toISOString();
  return {
    schoolId,
    admissionNo: form.admissionNo || null,
    firstName: form.firstName.trim(),
    middleName: form.middleName.trim() || null,
    lastName: form.lastName.trim(),
    gender: form.gender,
    dateOfBirth: isoDate(form.dateOfBirth),
    currentClassId: form.currentClassId,
    currentStreamId: form.currentStreamId || null,
    currentAcademicYearId: form.currentAcademicYearId,
    admissionDate: isoDate(form.admissionDate),
    previousSchool: form.previousSchool.trim() || null,
    status: form.status,
    guardianFullName: form.guardianFullName.trim(),
    guardianRelationship: form.guardianRelationship.trim(),
    guardianPhone: form.guardianPhone.trim(),
    guardianEmail: form.guardianEmail.trim() || null,
    guardianAddress: form.guardianAddress.trim() || null,
    emergencyContact: form.emergencyContact.trim(),
    medicalNotes: form.medicalNotes.trim() || null,
    photoUrl: form.photoUrl.trim() || null,
    supportingDocuments: form.supportingDocuments.split(",").map((item) => item.trim()).filter(Boolean),
    notes: form.notes.trim() || null
  };
}

function fromStudent(student: Student, config: SchoolConfig | null): RegistrationForm {
  const guardian = student.guardians?.[0];
  return {
    ...emptyForm,
    admissionNo: student.admissionNo,
    firstName: student.firstName,
    middleName: student.middleName ?? "",
    lastName: student.lastName,
    gender: student.gender as RegistrationForm["gender"],
    dateOfBirth: new Date(student.dateOfBirth).toISOString().slice(0, 10),
    currentClassId: student.currentClassId ?? config?.classes[0]?.id ?? "",
    currentStreamId: student.currentStreamId ?? "",
    currentAcademicYearId: student.currentAcademicYearId ?? config?.school.currentAcademicYearId ?? "",
    admissionDate: new Date(student.admissionDate).toISOString().slice(0, 10),
    status: student.status as RegistrationForm["status"],
    guardianFullName: guardian?.guardian.fullName ?? "",
    guardianRelationship: guardian?.relationship ?? "Guardian",
    guardianPhone: guardian?.guardian.phone ?? "",
    guardianEmail: guardian?.guardian.email ?? "",
    guardianAddress: guardian?.guardian.address ?? "",
    emergencyContact: student.emergencyContact ?? "",
    medicalNotes: student.medicalNotes ?? "",
    notes: student.notes ?? "",
    previousSchool: "",
    photoUrl: "",
    supportingDocuments: ""
  };
}

function DashboardView({ api, session, online, pendingCount, lastSync, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; session: Session; online: boolean; pendingCount: number; lastSync: string; setMessage: (message: string) => void }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [teacherWorkspace, setTeacherWorkspace] = useState<TeacherWorkspaceSummary | null>(null);
  const [summaryState, setSummaryState] = useState<MetricState>("loading");
  const [alerts, setAlerts] = useState<Array<{ type: string; title: string; severity?: string; createdAt: string }>>([]);
  const [activity, setActivity] = useState<AuditRecord[]>([]);
  const teachingWorkspace = isTeachingWorkspace(session.user);

  async function load() {
    setSummaryState(summary ? "ready" : "loading");
    try {
      if (teachingWorkspace) {
        const nextWorkspace = await api("/dashboard/teacher-workspace");
        setTeacherWorkspace(nextWorkspace);
        setSummaryState("ready");
        return;
      }
      const [nextSummary, nextAlerts, nextActivity] = await Promise.all([
        api("/dashboard/summary"),
        api("/dashboard/alerts"),
        api("/dashboard/activity")
      ]);
      setSummary(nextSummary);
      setAlerts(nextAlerts);
      setActivity(nextActivity);
      setSummaryState("ready");
    } catch (error) {
      setSummaryState("unavailable");
      setMessage(userMessage(error, "Dashboard unavailable."));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const financeOnly = isFinanceOnly(session.user.roles, session.user.permissions);
  const allCards = [
    ["Active students", countMetric(summary?.activeStudents, summaryState)],
    ["Teachers", countMetric(summary?.teachers, summaryState)],
    ["Expected fees", moneyMetric(summary?.expectedFees, summaryState)],
    ["Fees collected", moneyMetric(summary?.collectedFees, summaryState)],
    ["Outstanding fees", moneyMetric(summary?.outstandingFees, summaryState)],
    ["Collection rate", percentMetric(summary?.collectionPercentage, summaryState)],
    ["Teacher attendance today", countMetric(summary?.attendanceToday, summaryState)],
    ["Budget approvals", countMetric(summary?.pendingBudgetApprovals, summaryState)],
    ["Expense approvals", countMetric(summary?.pendingExpenseApprovals, summaryState)],
    ["Sync conflicts", countMetric(summary?.unresolvedSyncConflicts, summaryState)],
    ["Risk alerts", countMetric(summary?.suspiciousFinancialActivities, summaryState)],
    ["Low stock", countMetric(summary?.lowStockItems, summaryState)],
    ["Marks awaiting approval", countMetric(summary?.marksAwaitingApproval, summaryState)],
    ["Published report cards", countMetric(summary?.publishedReportCards, summaryState)],
    ["Active payroll runs", countMetric(summary?.activePayrollRuns, summaryState)],
    ["Failed notifications", countMetric(summary?.failedNotifications, summaryState)],
    ["Portal logins today", countMetric(summary?.portalLoginsToday, summaryState)]
  ];
  const financeCards = [
    ["Expected fees", moneyMetric(summary?.expectedFees, summaryState)],
    ["Fees collected", moneyMetric(summary?.collectedFees, summaryState)],
    ["Outstanding fees", moneyMetric(summary?.outstandingFees, summaryState)],
    ["Collection rate", percentMetric(summary?.collectionPercentage, summaryState)],
    ["Discounts/Waivers", moneyMetric(summary?.discountsWaivers, summaryState)],
    ["Expenses", moneyMetric(summary?.expenses, summaryState)],
    ["Net cash movement", moneyMetric(summary?.netCashMovement, summaryState)],
    ["Budget approvals", countMetric(summary?.pendingBudgetApprovals, summaryState)],
    ["Active payroll runs", countMetric(summary?.activePayrollRuns, summaryState)]
  ];
  const cards = financeOnly ? financeCards : allCards;

  if (teachingWorkspace) {
    return (
      <TeacherWorkspaceDashboard
        workspace={teacherWorkspace}
        state={summaryState}
        online={online}
        pendingCount={pendingCount}
        lastSync={lastSync}
        onRefresh={() => void load()}
      />
    );
  }

  return (
    <section className="dashboard-grid">
      {!online && <div className="notice stale">Offline. Figures are from the last synchronized cache where available. Last sync: {lastSync}. Pending local changes: {pendingCount}.</div>}
      <section className="metric-grid wide-panel">
        {cards.map(([label, value]) => <div className={value === "Unavailable" ? "metric muted-metric" : "metric"} key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>
      <section className="operation-panel">
        <div className="section-heading"><h3>Finance Overview</h3><button type="button" onClick={() => void load()}>Refresh</button></div>
        <dl className="finance-dl">
          <dt>Discounts/Waivers</dt><dd>{moneyMetric(summary?.discountsWaivers, summaryState)}</dd>
          <dt>Expenses</dt><dd>{moneyMetric(summary?.expenses, summaryState)}</dd>
          <dt>Net cash movement</dt><dd>{moneyMetric(summary?.netCashMovement, summaryState)}</dd>
          <dt>As of</dt><dd>{summary ? new Date(summary.asOf).toLocaleString() : stateLabel(summaryState)}</dd>
        </dl>
      </section>
      {!financeOnly && <section className="operation-panel">
        <div className="section-heading"><h3>Action Alerts</h3><span className="pill">{alerts.length}</span></div>
        <DataTable label="Action alerts" compact><tbody>
          {alerts.map((alert, index) => <tr key={`${alert.type}-${index}`}><td><span className="pill">{alert.type}</span></td><td>{alert.title}</td><td>{alert.severity ?? ""}</td></tr>)}
          {alerts.length === 0 && <tr><td className="empty">No active alerts.</td></tr>}
        </tbody></DataTable>
      </section>}
      {!financeOnly && <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Recent Activity</h3></div>
        <DataTable label="Recent audit activity">
          <thead><tr><th>Time</th><th>Action</th><th>Entity</th></tr></thead>
          <tbody>
            {activity.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.action}</td><td>{item.entityType}</td></tr>)}
            {activity.length === 0 && <tr><td colSpan={3} className="empty">No recent activity yet.</td></tr>}
          </tbody>
        </DataTable>
      </section>}
    </section>
  );
}

function TeacherWorkspaceDashboard({ workspace, state, online, pendingCount, lastSync, onRefresh }: { workspace: TeacherWorkspaceSummary | null; state: MetricState; online: boolean; pendingCount: number; lastSync: string; onRefresh: () => void }) {
  const today = new Date().getDay() || 7;
  const todayLessons = workspace?.timetable.filter((entry) => entry.dayOfWeek === today) ?? [];
  const cards = [
    ["Class rooms", countMetric(workspace?.classLearners.length, state)],
    ["Assigned subjects", countMetric(workspace?.subjectAssignments.length, state)],
    ["Open assessments", countMetric(workspace?.openAssessments.length, state)],
    ["Today lessons", countMetric(todayLessons.length, state)],
    ["Staff notices", countMetric(workspace?.announcements.length, state)]
  ];
  return (
    <section className="dashboard-grid teacher-dashboard">
      {!online && <div className="notice stale">Offline. Teacher workspace data is from the last available request. Last sync: {lastSync}. Pending local changes: {pendingCount}.</div>}
      <section className="operation-panel wide-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">My teaching workspace</p>
            <h3>{workspace?.teacher ? `${workspace.teacher.firstName} ${workspace.teacher.lastName}` : "Teacher workspace"}</h3>
            <p className="panel-copy">Assigned classes, subject load, timetable, assessments, and staff announcements.</p>
          </div>
          <button type="button" onClick={onRefresh}>Refresh</button>
        </div>
        <div className="summary-strip">
          {cards.map(([label, value]) => <span key={label}><strong>{value}</strong>{label}</span>)}
        </div>
      </section>

      <section className="operation-panel">
        <div className="section-heading"><h3>Assigned Classes</h3></div>
        <DataTable label="Assigned class learner counts" compact>
          <thead><tr><th>Class</th><th>Active learners</th></tr></thead>
          <tbody>
            {(workspace?.classLearners ?? []).map((row) => <tr key={`${row.classId}-${row.streamId ?? "all"}`}><td>{row.label}</td><td>{row.activeStudents}</td></tr>)}
            {state === "loading" && <tr><td colSpan={2} className="empty">Loading class assignments...</td></tr>}
            {state !== "loading" && (workspace?.classLearners ?? []).length === 0 && <tr><td colSpan={2} className="empty">No class or subject assignments have been linked to this login.</td></tr>}
          </tbody>
        </DataTable>
      </section>

      <section className="operation-panel">
        <div className="section-heading"><h3>Subject Load</h3></div>
        <div className="pill-stack subject-load">
          {(workspace?.subjectAssignments ?? []).map((assignment) => <span className="pill" key={assignment.id}>{assignment.subject} - {assignment.label}</span>)}
          {state !== "loading" && (workspace?.subjectAssignments ?? []).length === 0 && <span className="muted-text">No assigned subjects yet.</span>}
        </div>
      </section>

      <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Open Assessments</h3></div>
        <DataTable label="Open teacher assessments">
          <thead><tr><th>Assessment</th><th>Subject</th><th>Exam</th><th>Status</th></tr></thead>
          <tbody>
            {(workspace?.openAssessments ?? []).map((assessment) => <tr key={assessment.id}><td>{assessment.name}</td><td>{assessment.subject}</td><td>{assessment.examination}</td><td><span className="pill">{assessment.status}</span></td></tr>)}
            {state === "loading" && <tr><td colSpan={4} className="empty">Loading assessments...</td></tr>}
            {state !== "loading" && (workspace?.openAssessments ?? []).length === 0 && <tr><td colSpan={4} className="empty">No open assessments need marks entry right now.</td></tr>}
          </tbody>
        </DataTable>
      </section>

      <section className="operation-panel">
        <div className="section-heading"><h3>Today</h3></div>
        <DataTable label="Today timetable" compact>
          <thead><tr><th>Time</th><th>Lesson</th></tr></thead>
          <tbody>
            {todayLessons.map((entry) => <tr key={entry.id}><td>{entry.startsAt}-{entry.endsAt}</td><td>{entry.subject}<br /><small>{entry.class}{entry.room ? `, ${entry.room}` : ""}</small></td></tr>)}
            {state === "loading" && <tr><td colSpan={2} className="empty">Loading timetable...</td></tr>}
            {state !== "loading" && todayLessons.length === 0 && <tr><td colSpan={2} className="empty">No lessons are scheduled for today.</td></tr>}
          </tbody>
        </DataTable>
      </section>

      <section className="operation-panel">
        <div className="section-heading"><h3>Staff Announcements</h3></div>
        <div className="announcement-stack">
          {(workspace?.announcements ?? []).map((announcement) => (
            <article key={announcement.id} className="announcement-card">
              <span className="pill">{announcement.priority}</span>
              <strong>{announcement.title}</strong>
              <p>{announcement.message}</p>
              <small>{dateOnly(announcement.publishAt)}</small>
            </article>
          ))}
          {state !== "loading" && (workspace?.announcements ?? []).length === 0 && <div className="empty">No current staff announcements.</div>}
        </div>
      </section>
    </section>
  );
}

function FinanceView({ api, config, students, session, online, refreshOfflineState, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; config: SchoolConfig | null; students: Student[]; session: Session; online: boolean; refreshOfflineState: () => Promise<void>; setMessage: (message: string) => void }) {
  const [tab, setTab] = useState<"overview" | "fees" | "invoices" | "payments" | "expenses" | "reports">("overview");
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [fees, setFees] = useState<FeeStructureRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [localPayments, setLocalPayments] = useState<any[]>([]);
  const [localExpenses, setLocalExpenses] = useState<any[]>([]);
  const [feeForm, setFeeForm] = useState({ classId: "", category: "Tuition", name: "", amount: "", dueDate: "2026-02-01", isMandatory: true });
  const [paymentForm, setPaymentForm] = useState({ invoiceId: "", amount: "", method: "CASH", reference: "", paidAt: new Date().toISOString().slice(0, 10), notes: "" });
  const [expenseForm, setExpenseForm] = useState({ category: "Stationery", department: "Administration", description: "", amount: "", method: "CASH", payee: "", reference: "", budgetId: "", spentAt: new Date().toISOString().slice(0, 10) });

  async function load() {
    const [nextOverview, nextFees, nextInvoices, nextExpenses, pendingPayments, pendingExpenses] = await Promise.all([
      api("/finance/overview"),
      api("/finance/fee-structures"),
      api("/finance/invoices"),
      api("/finance/expenses"),
      readLocalPayments(),
      readLocalExpenses()
    ]);
    setOverview(nextOverview);
    setFees(asArray<FeeStructureRecord>(nextFees));
    setInvoices(asArray<InvoiceRecord>(nextInvoices));
    setExpenses(asArray<any>(nextExpenses));
    setLocalPayments(asArray<any>(pendingPayments));
    setLocalExpenses(asArray<any>(pendingExpenses));
  }

  useEffect(() => {
    void load().catch((error) => setMessage(userMessage(error, "Finance data unavailable.")));
  }, []);

  useEffect(() => {
    if (config) setFeeForm((current) => ({ ...current, classId: current.classId || config.classes[0]?.id || "" }));
  }, [config]);

  async function createFee(event: React.FormEvent) {
    event.preventDefault();
    const amount = positiveNumber(feeForm.amount);
    if (!feeForm.classId || !feeForm.name.trim() || amount === null) {
      setMessage("Choose a class, enter a fee name, and use an amount above zero.");
      return;
    }
    await api("/finance/fee-structures", {
      method: "POST",
      body: JSON.stringify({
        classId: feeForm.classId,
        academicYearId: config?.school.currentAcademicYearId,
        termId: config?.school.currentTermId,
        category: feeForm.category,
        name: feeForm.name,
        amount,
        dueDate: new Date(feeForm.dueDate).toISOString(),
        isMandatory: feeForm.isMandatory,
        isActive: true
      })
    });
    setMessage("Fee structure created.");
    await load();
  }

  async function generateInvoices() {
    if (!feeForm.classId || !config?.school.currentTermId) {
      setMessage("Choose a class and current term before generating invoices.");
      return;
    }
    await api("/finance/invoices/generate", { method: "POST", body: JSON.stringify({ termId: config?.school.currentTermId, classId: feeForm.classId, dueDate: new Date(feeForm.dueDate).toISOString() }) });
    setMessage("Invoices generated without duplicating existing invoices.");
    await load();
  }

  async function recordPayment(event: React.FormEvent) {
    event.preventDefault();
    const amount = positiveNumber(paymentForm.amount);
    const invoice = invoices.find((item) => item.id === paymentForm.invoiceId);
    if (!invoice || amount === null) {
      setMessage("Choose an invoice and enter a payment amount above zero.");
      return;
    }
    if (amount > Number(invoice.balance)) {
      setMessage("Payment cannot exceed the selected invoice balance.");
      return;
    }
    const payload = {
      invoiceId: paymentForm.invoiceId,
      amount,
      method: paymentForm.method,
      reference: paymentForm.reference || null,
      paidAt: new Date(paymentForm.paidAt).toISOString(),
      notes: paymentForm.notes || null,
      receivedBy: session.user.displayName,
      createdBy: session.user.id
    };
    try {
      if (!online) throw new Error("Offline");
      await api("/finance/payments", { method: "POST", body: JSON.stringify(payload) });
      setMessage("Payment recorded and receipt generated.");
    } catch {
      const id = crypto.randomUUID();
      const offlineReceiptNo = `OFF-${deviceId.slice(-4)}-${Date.now()}`;
      await upsertLocalPayment({ id, ...payload, schoolId: session.user.schoolId, deviceId, receiptNo: offlineReceiptNo, syncStatus: "PENDING" });
      await addPendingChange({ id: crypto.randomUUID(), entityType: SyncEntityType.Payment, entityId: id, operation: "CREATE", payload: { ...payload, receiptNo: offlineReceiptNo }, baseVersion: null, createdAt: new Date().toISOString(), retryCount: 0 }, session.user.schoolId, deviceId);
      setMessage(`Payment saved offline with provisional receipt ${offlineReceiptNo}.`);
    }
    await refreshOfflineState();
    await load().catch(() => undefined);
  }

  async function recordExpense(event: React.FormEvent) {
    event.preventDefault();
    const amount = positiveNumber(expenseForm.amount);
    if (!expenseForm.category.trim() || !expenseForm.description.trim() || amount === null) {
      setMessage("Enter an expense category, description, and amount above zero.");
      return;
    }
    const payload = { ...expenseForm, amount, spentAt: new Date(expenseForm.spentAt).toISOString(), budgetId: expenseForm.budgetId || null, requestedBy: session.user.id, createdBy: session.user.id };
    try {
      if (!online) throw new Error("Offline");
      await api("/finance/expenses", { method: "POST", body: JSON.stringify(payload) });
      setMessage("Expense recorded.");
    } catch {
      const id = crypto.randomUUID();
      await upsertLocalExpense({ id, ...payload, schoolId: session.user.schoolId, deviceId, expenseNo: `OFF-EXP-${Date.now()}`, approvalStatus: "PENDING", syncStatus: "PENDING" });
      await addPendingChange({ id: crypto.randomUUID(), entityType: SyncEntityType.Expense, entityId: id, operation: "CREATE", payload, baseVersion: null, createdAt: new Date().toISOString(), retryCount: 0 }, session.user.schoolId, deviceId);
      setMessage("Expense saved offline and queued for synchronization.");
    }
    await refreshOfflineState();
    await load().catch(() => undefined);
  }

  const selectedPaymentInvoice = invoices.find((invoice) => invoice.id === paymentForm.invoiceId);
  const paymentRows = invoices.flatMap((invoice) => (invoice.payments ?? []).map((payment) => [
    payment.receipt?.receiptNo ?? payment.receiptNo ?? "-",
    invoice.invoiceNo,
    `${invoice.student.firstName} ${invoice.student.lastName}`,
    ugx(payment.amount),
    payment.method,
    dateOnly(payment.paidAt)
  ]));
  const canCreateFee = Boolean(feeForm.classId && feeForm.name.trim() && positiveNumber(feeForm.amount));
  const canRecordPayment = Boolean(selectedPaymentInvoice && positiveNumber(paymentForm.amount) && Number(paymentForm.amount) <= Number(selectedPaymentInvoice.balance));
  const canRecordExpense = Boolean(expenseForm.category.trim() && expenseForm.description.trim() && positiveNumber(expenseForm.amount));

  return (
    <section className="operations-grid finance-layout">
      <div className="print-only wide-panel">
        <h2>{config?.school.name ?? "Aethina School Management System"} Finance Output</h2>
        <p>Generated {new Date().toLocaleString()} by {session.user.displayName}</p>
      </div>
      <div className="tabs wide-panel">
        {["overview", "fees", "invoices", "payments", "expenses", "reports"].map((item) => <button key={item} className={tab === item ? "active" : "ghost"} type="button" onClick={() => setTab(item as typeof tab)}>{item}</button>)}
      </div>
      {tab === "overview" && <section className="metric-grid wide-panel">
        <div className="section-heading print-span"><h3>Essential Financial Summary</h3><button type="button" className="ghost no-print" onClick={printPage}>Print</button></div>
        <div className="metric"><span>Expected</span><strong>{ugx(overview?.expectedFees)}</strong></div>
        <div className="metric"><span>Collected</span><strong>{ugx(overview?.collectedFees)}</strong></div>
        <div className="metric"><span>Outstanding</span><strong>{ugx(overview?.outstandingFees)}</strong></div>
        <div className="metric"><span>Collection</span><strong>{overview?.collectionPercentage ?? 0}%</strong></div>
        <div className="metric"><span>Discounts</span><strong>{ugx(overview?.discounts)}</strong></div>
        <div className="metric"><span>Expenses</span><strong>{ugx(overview?.expenses)}</strong></div>
      </section>}
      {tab === "fees" && <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Fee Structures</h3><button type="button" onClick={generateInvoices} disabled={!feeForm.classId}>Generate Invoices</button></div>
        <form className="inline-form" onSubmit={(event) => void createFee(event)}>
          <select value={feeForm.classId} onChange={(event) => setFeeForm({ ...feeForm, classId: event.target.value })}>{config?.classes.map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}</select>
          <input placeholder="Category" value={feeForm.category} onChange={(event) => setFeeForm({ ...feeForm, category: event.target.value })} />
          <input placeholder="Fee name" value={feeForm.name} onChange={(event) => setFeeForm({ ...feeForm, name: event.target.value })} required />
          <input type="number" min="1" step="1" placeholder="Amount" value={feeForm.amount} onChange={(event) => setFeeForm({ ...feeForm, amount: event.target.value })} required />
          <input type="date" value={feeForm.dueDate} onChange={(event) => setFeeForm({ ...feeForm, dueDate: event.target.value })} />
          <button type="submit" disabled={!canCreateFee}>Add Fee</button>
        </form>
        <FinanceTable rows={fees.map((fee) => [fee.class?.name ?? "-", fee.category, fee.name, ugx(fee.amount), fee.isActive ? "Active" : "Inactive"])} headings={["Class", "Category", "Name", "Amount", "Status"]} />
      </section>}
      {tab === "invoices" && <section className="operation-panel wide-panel"><div className="section-heading"><h3>Student Invoices / Fee Statements</h3><button type="button" className="ghost no-print" onClick={printPage}>Print</button></div><InvoiceTable invoices={invoices} /></section>}
      {tab === "payments" && <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Record Payment</h3><div className="row-actions"><button type="button" className="ghost no-print" onClick={printPage}>Print Receipts</button><span className="pill">{localPayments.length} offline pending</span></div></div>
        <form className="inline-form" onSubmit={(event) => void recordPayment(event)}>
          <select value={paymentForm.invoiceId} onChange={(event) => setPaymentForm({ ...paymentForm, invoiceId: event.target.value })}><option value="">Select invoice</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} - {invoice.student.firstName} {invoice.student.lastName} - {ugx(invoice.balance)}</option>)}</select>
          <input type="number" min="1" max={selectedPaymentInvoice ? Number(selectedPaymentInvoice.balance) : undefined} step="1" placeholder="Amount" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} required />
          <select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>{["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "BANK_DEPOSIT", "CHEQUE", "ONLINE_PAYMENT", "OTHER"].map((method) => <option key={method}>{method}</option>)}</select>
          <input placeholder="Reference" value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} />
          <input type="date" value={paymentForm.paidAt} onChange={(event) => setPaymentForm({ ...paymentForm, paidAt: event.target.value })} />
          <button type="submit" disabled={!canRecordPayment}>Record</button>
        </form>
        <FinanceTable rows={paymentRows} headings={["Receipt", "Invoice", "Student", "Amount", "Method", "Paid"]} />
      </section>}
      {tab === "expenses" && <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Expenses</h3><span className="pill">{localExpenses.length} offline pending</span></div>
        <form className="inline-form" onSubmit={(event) => void recordExpense(event)}>
          <input placeholder="Category" value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} required />
          <input placeholder="Department" value={expenseForm.department} onChange={(event) => setExpenseForm({ ...expenseForm, department: event.target.value })} />
          <input placeholder="Description" value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} required />
          <input type="number" min="1" step="1" placeholder="Amount" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} required />
          <input placeholder="Payee" value={expenseForm.payee} onChange={(event) => setExpenseForm({ ...expenseForm, payee: event.target.value })} />
          <button type="submit" disabled={!canRecordExpense}>Record</button>
        </form>
        <FinanceTable rows={expenses.map((expense) => [expense.expenseNo ?? "-", expense.category, expense.department ?? "-", ugx(expense.amount), expense.approvalStatus])} headings={["No.", "Category", "Department", "Amount", "Status"]} />
      </section>}
      {tab === "reports" && <section className="operation-panel wide-panel"><div className="section-heading"><h3>Initial Reports</h3><button type="button" className="ghost no-print" onClick={printPage}>Print</button></div><FinanceTable rows={invoices.map((invoice) => [invoice.student.admissionNo, `${invoice.student.firstName} ${invoice.student.lastName}`, ugx(invoice.amount), ugx(invoice.amountPaid), ugx(invoice.balance)])} headings={["Admission", "Student", "Expected", "Paid", "Balance"]} /></section>}
    </section>
  );
}

function BudgetsView({ api, config, session, online, refreshOfflineState, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; config: SchoolConfig | null; session: Session; online: boolean; refreshOfflineState: () => Promise<void>; setMessage: (message: string) => void }) {
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [form, setForm] = useState({ name: "", department: "Administration", category: "Operations", amount: "", warningThreshold: "80", hardCap: true, year: "2026" });
  const [request, setRequest] = useState({ budgetId: "", amount: "", reason: "" });
  async function load() {
    const rows = await api("/finance/budgets");
    const nextRows = asArray<BudgetRecord>(rows);
    setBudgets(nextRows);
    setRequest((current) => ({ ...current, budgetId: current.budgetId || nextRows[0]?.id || "" }));
  }
  useEffect(() => { void load().catch((error) => setMessage(userMessage(error, "Budgets unavailable."))); }, []);
  async function createBudget(event: React.FormEvent) {
    event.preventDefault();
    const amount = positiveNumber(form.amount);
    const warningThreshold = Number(form.warningThreshold);
    const year = Number(form.year);
    if (!form.name.trim() || !form.department.trim() || !form.category.trim() || amount === null || !Number.isInteger(warningThreshold) || warningThreshold < 1 || warningThreshold > 100 || !Number.isInteger(year)) {
      setMessage("Complete the budget name, department, category, amount, year, and warning threshold.");
      return;
    }
    await api("/finance/budgets", { method: "POST", body: JSON.stringify({ ...form, amount, warningThreshold, year, academicYearId: config?.school.currentAcademicYearId, termId: config?.school.currentTermId }) });
    setMessage("Budget created.");
    await load();
  }
  async function submitRequest(event: React.FormEvent) {
    event.preventDefault();
    const amount = positiveNumber(request.amount);
    if (!request.budgetId || amount === null || request.reason.trim().length < 10) {
      setMessage("Choose a budget, enter an amount above zero, and give a reason of at least 10 characters.");
      return;
    }
    const payload = { budgetId: request.budgetId, amount, reason: request.reason, requestedBy: session.user.id };
    if (!online) {
      await addPendingChange({ id: crypto.randomUUID(), entityType: SyncEntityType.BudgetRequest, entityId: crypto.randomUUID(), operation: "CREATE", payload, baseVersion: null, createdAt: new Date().toISOString(), retryCount: 0 }, session.user.schoolId, deviceId);
      await refreshOfflineState();
      setMessage("Budget request saved offline and queued.");
      return;
    }
    await api("/finance/budget-requests", { method: "POST", body: JSON.stringify(payload) });
    setMessage("Budget request submitted.");
    await load();
  }
  const canCreateBudget = Boolean(form.name.trim() && form.department.trim() && form.category.trim() && positiveNumber(form.amount));
  const canSubmitBudgetRequest = Boolean(request.budgetId && positiveNumber(request.amount) && request.reason.trim().length >= 10);

  return (
    <section className="operations-grid">
      <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Budget Utilization</h3><button type="button" onClick={() => void load()}>Refresh</button></div>
        <FinanceTable rows={budgets.map((budget) => {
          const amount = Number(budget.amount);
          const spent = Number(budget.spentAmount);
          return [budget.name, budget.department, budget.category, ugx(amount), ugx(spent), ugx(amount - spent), amount ? `${Math.round((spent / amount) * 100)}%` : "0%", budget.approvalStatus];
        })} headings={["Budget", "Department", "Category", "Allocated", "Spent", "Remaining", "Used", "Status"]} />
      </section>
      <form className="operation-panel panel-form" onSubmit={(event) => void createBudget(event)}>
        <div className="section-heading"><h3>Create Budget</h3><button type="submit" disabled={!canCreateBudget}>Save</button></div>
        <input placeholder="Budget name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <input placeholder="Department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} required />
        <input placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required />
        <input type="number" min="1" step="1" placeholder="Amount" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
      </form>
      <form className="operation-panel panel-form" onSubmit={(event) => void submitRequest(event)}>
        <div className="section-heading"><h3>Budget Request</h3><button type="submit" disabled={!canSubmitBudgetRequest}>Submit</button></div>
        <select value={request.budgetId} onChange={(event) => setRequest({ ...request, budgetId: event.target.value })}>{budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.name}</option>)}</select>
        <input type="number" min="1" step="1" placeholder="Amount" value={request.amount} onChange={(event) => setRequest({ ...request, amount: event.target.value })} required />
        <textarea placeholder="Reason" value={request.reason} onChange={(event) => setRequest({ ...request, reason: event.target.value })} required />
      </form>
    </section>
  );
}

function ApprovalsView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [rows, setRows] = useState<ApprovalRecord[]>([]);
  async function load() { setRows(asArray<ApprovalRecord>(await api("/approvals"))); }
  useEffect(() => { void load().catch((error) => setMessage(userMessage(error, "Approvals unavailable."))); }, []);
  async function decide(id: string, decision: string) {
    await api(`/approvals/${id}/decision`, { method: "POST", body: JSON.stringify({ decision, comment: `Desktop ${decision.toLowerCase()} decision` }) });
    setMessage(`Approval ${decision.toLowerCase().replaceAll("_", " ")}.`);
    await load();
  }
  return <section className="operation-panel"><div className="section-heading"><h3>Approval Inbox</h3><button type="button" onClick={() => void load()}>Refresh</button></div><DataTable label="Approval inbox"><thead><tr><th>Type</th><th>Submitted</th><th>Level</th><th>Status</th><th>Decision</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.entityType}<br /><small>{row.entityId}</small></td><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.approvalLevel}</td><td><span className="pill">{row.status}</span></td><td className="row-actions"><button type="button" onClick={() => void decide(row.id, "APPROVED")}>Approve</button><button className="ghost" type="button" onClick={() => void decide(row.id, "REJECTED")}>Reject</button><button className="ghost" type="button" onClick={() => void decide(row.id, "RETURNED_FOR_CORRECTION")}>Return</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={5} className="empty">No approval items waiting.</td></tr>}</tbody></DataTable></section>;
}

function UsersRolesView({ api, session, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; session: Session; setMessage: (message: string) => void }) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [resetUserId, setResetUserId] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [createForm, setCreateForm] = useState({ displayName: "", email: "", temporaryPassword: "", roleIds: [] as string[] });
  const [roleEditUserId, setRoleEditUserId] = useState("");
  const [roleEditIds, setRoleEditIds] = useState<string[]>([]);
  const [scopeUserId, setScopeUserId] = useState("");
  const [scopeBands, setScopeBands] = useState<Array<"LOWER" | "MIDDLE" | "UPPER">>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [nextUsers, nextRoles] = await Promise.all([api("/users"), api("/users/roles")]);
    setUsers(asArray<UserRecord>(nextUsers));
    setRoles(asArray<RoleOption>(nextRoles));
  }

  useEffect(() => {
    void load().catch((error) => setMessage(userMessage(error, "Users unavailable.")));
  }, []);

  const filteredUsers = users.filter((user) => {
    const haystack = `${user.displayName} ${user.email} ${roleNames(user).join(" ")}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesStatus = !status || (status === "ACTIVE" ? user.isActive : !user.isActive);
    return matchesSearch && matchesStatus;
  });
  const selectedResetUser = users.find((user) => user.id === resetUserId);
  const selectedRoleUser = users.find((user) => user.id === roleEditUserId);
  const selectedScopeUser = users.find((user) => user.id === scopeUserId);
  const academicUsers = users.filter(isAcademicScopeCandidate);
  const roleSummary = summarizeRoles(users);

  async function setActive(user: UserRecord, isActive: boolean) {
    if (user.id === session.user.id && !isActive) {
      setMessage("You cannot deactivate your own active session.");
      return;
    }
    setBusy(true);
    try {
      await api(`/users/${user.id}/${isActive ? "activate" : "deactivate"}`, { method: "POST", body: "{}" });
      setMessage(`${user.displayName} ${isActive ? "reactivated" : "deactivated"}.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!resetUserId) {
      setMessage("Choose a user before resetting a password.");
      return;
    }
    setBusy(true);
    try {
      await api("/users/reset-password", { method: "POST", body: JSON.stringify({ userId: resetUserId, temporaryPassword }) });
      setTemporaryPassword("");
      setMessage(`Temporary password set for ${selectedResetUser?.displayName ?? "selected user"}.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    if (createForm.roleIds.length === 0) {
      setMessage("Choose at least one role for the new user.");
      return;
    }
    setBusy(true);
    try {
      await api("/users", { method: "POST", body: JSON.stringify(createForm) });
      setCreateForm({ displayName: "", email: "", temporaryPassword: "", roleIds: [] });
      setMessage("User created with temporary password and assigned roles.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveRoles(event: React.FormEvent) {
    event.preventDefault();
    if (!roleEditUserId || roleEditIds.length === 0) {
      setMessage("Choose a user and at least one role.");
      return;
    }
    setBusy(true);
    try {
      await api(`/users/${roleEditUserId}/roles`, { method: "POST", body: JSON.stringify({ roleIds: roleEditIds }) });
      setRoleEditUserId("");
      setRoleEditIds([]);
      setMessage(`Roles updated for ${selectedRoleUser?.displayName ?? "selected user"}.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function startRoleEdit(user: UserRecord) {
    setRoleEditUserId(user.id);
    setRoleEditIds(user.roles.map((item) => item.role.id));
  }

  function startScopeEdit(user: UserRecord) {
    setScopeUserId(user.id);
    setScopeBands((user.academicScopeAssignments ?? []).map((scope) => scope.band));
  }

  async function saveAcademicScopes(event: React.FormEvent) {
    event.preventDefault();
    if (!scopeUserId || scopeBands.length === 0) {
      setMessage("Choose an academic user and at least one school division.");
      return;
    }
    setBusy(true);
    try {
      await api(`/users/${scopeUserId}/academic-scopes`, { method: "POST", body: JSON.stringify({ bands: scopeBands }) });
      setMessage(`Academic scope updated for ${selectedScopeUser?.displayName ?? "selected user"}.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="operation-panel wide-panel">
      <div className="section-heading">
        <div>
          <h3>User & Role Management</h3>
          <p className="panel-copy">Manage staff access, temporary passwords, account status, and role visibility.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy}>Refresh</button>
      </div>

      <div className="summary-strip">
        <span>{users.filter((user) => user.isActive).length} active users</span>
        <span>{users.filter((user) => !user.isActive).length} inactive users</span>
        <span>{users.filter((user) => user.mustChangePassword).length} password resets pending</span>
        <span>{roleSummary.length} roles in use</span>
      </div>

      <div className="filters user-filters">
        <input placeholder="Search name, email, or role" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <button type="button" onClick={() => { setSearch(""); setStatus(""); }}>Clear</button>
      </div>

      <div className="role-matrix">
        {roleSummary.map((role) => (
          <div key={role.name}>
            <strong>{formatRoleName(role.name)}</strong>
            <span>{role.count} user{role.count === 1 ? "" : "s"}</span>
          </div>
        ))}
        {roleSummary.length === 0 && <div><strong>No roles</strong><span>No role assignments found.</span></div>}
      </div>

      <DataTable label="Users and assigned roles">
          <thead><tr><th>User</th><th>Roles</th><th>Academic Scope</th><th>Status</th><th>Security</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>{user.displayName}<br /><small>{user.email}</small></td>
                <td><div className="pill-stack">{roleNames(user).map((role) => <span className="pill" key={role}>{formatRoleName(role)}</span>)}</div></td>
                <td><AcademicScopeBadges scopes={user.academicScopeAssignments ?? []} /></td>
                <td><span className="pill">{user.isActive ? "ACTIVE" : "INACTIVE"}</span></td>
                <td>
                  {user.mustChangePassword ? "Password reset pending" : "Password current"}
                  {user.lockedUntil && <><br /><small>Locked until {new Date(user.lockedUntil).toLocaleString()}</small></>}
                  {user.failedLoginAttempts > 0 && <><br /><small>{user.failedLoginAttempts} failed login attempt{user.failedLoginAttempts === 1 ? "" : "s"}</small></>}
                </td>
                <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</td>
                <td className="row-actions">
                  <button className="ghost" type="button" onClick={() => setResetUserId(user.id)}>Reset</button>
                  <button className="ghost" type="button" disabled={user.id === session.user.id} onClick={() => startRoleEdit(user)}>Roles</button>
                  {isAcademicScopeCandidate(user) && <button className="ghost" type="button" onClick={() => startScopeEdit(user)}>Scope</button>}
                  {user.isActive ? (
                    <button className="ghost" type="button" disabled={busy || user.id === session.user.id} onClick={() => void setActive(user, false)}>Deactivate</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void setActive(user, true)}>Reactivate</button>
                  )}
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && <tr><td colSpan={7} className="empty">No users match the current filters.</td></tr>}
          </tbody>
      </DataTable>

      <form className="admin-form-panel" onSubmit={createUser}>
        <div>
          <h4>Create Staff User</h4>
          <p className="panel-copy">New users must change their temporary password after first login.</p>
        </div>
        <div className="inline-admin-form embedded">
          <label>
            Name
            <input value={createForm.displayName} onChange={(event) => setCreateForm({ ...createForm, displayName: event.target.value })} placeholder="Full name" required />
          </label>
          <label>
            Email
            <input type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} placeholder="name@school.test" required />
          </label>
          <label>
            Temporary password
            <input type="password" value={createForm.temporaryPassword} minLength={10} onChange={(event) => setCreateForm({ ...createForm, temporaryPassword: event.target.value })} placeholder="At least 10 characters" required />
          </label>
          <button type="submit" disabled={busy || createForm.roleIds.length === 0}>Create User</button>
        </div>
        <RoleChecklist roles={roles} selected={createForm.roleIds} onChange={(roleIds) => setCreateForm({ ...createForm, roleIds })} />
      </form>

      <form className="admin-form-panel" onSubmit={saveRoles}>
        <div className="section-heading compact-heading">
          <div>
            <h4>Assign Roles</h4>
            <p className="panel-copy">{selectedRoleUser ? `${selectedRoleUser.displayName} - ${selectedRoleUser.email}` : "Select a user from the table."}</p>
          </div>
          <button type="submit" disabled={busy || !roleEditUserId || roleEditIds.length === 0}>Save Roles</button>
        </div>
        <RoleChecklist roles={roles} selected={roleEditIds} onChange={setRoleEditIds} />
      </form>

      <form className="admin-form-panel" onSubmit={saveAcademicScopes}>
        <div className="section-heading compact-heading">
          <div>
            <h4>DOS Academic Scope</h4>
            <p className="panel-copy">{selectedScopeUser ? `${selectedScopeUser.displayName} - ${academicScopeText(selectedScopeUser.academicScopeAssignments ?? [])}` : "Assign lower, middle, or upper school ownership to an academic administrator."}</p>
          </div>
          <button type="submit" disabled={busy || !scopeUserId || scopeBands.length === 0}>Save Scope</button>
        </div>
        <div className="inline-admin-form embedded">
          <label>
            Academic user
            <select value={scopeUserId} onChange={(event) => {
              const user = users.find((item) => item.id === event.target.value);
              setScopeUserId(event.target.value);
              setScopeBands((user?.academicScopeAssignments ?? []).map((scope) => scope.band));
            }}>
              <option value="">Choose DOS user</option>
              {academicUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName} - {user.email}</option>)}
            </select>
          </label>
          <ScopeChecklist selected={scopeBands} onChange={setScopeBands} />
        </div>
      </form>

      <form className="inline-admin-form" onSubmit={resetPassword}>
        <label>
          User
          <select value={resetUserId} onChange={(event) => setResetUserId(event.target.value)}>
            <option value="">Choose user</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.displayName} - {user.email}</option>)}
          </select>
        </label>
        <label>
          Temporary password
          <input type="password" value={temporaryPassword} minLength={10} onChange={(event) => setTemporaryPassword(event.target.value)} placeholder="At least 10 characters" required />
        </label>
        <button type="submit" disabled={busy || !resetUserId || temporaryPassword.length < 10}>Set Password</button>
      </form>
    </section>
  );
}

function RoleChecklist({ roles, selected, onChange }: { roles: RoleOption[]; selected: string[]; onChange: (roleIds: string[]) => void }) {
  return (
    <div className="role-checklist">
      {roles.map((role) => (
        <label key={role.id}>
          <input type="checkbox" checked={selected.includes(role.id)} onChange={() => onChange(toggleId(selected, role.id))} />
          <span>
            <strong>{formatRoleName(role.name)}</strong>
            <small>{role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"} - {role._count?.users ?? 0} user{role._count?.users === 1 ? "" : "s"}</small>
          </span>
        </label>
      ))}
      {roles.length === 0 && <div className="empty-state">No roles have been configured for this school.</div>}
    </div>
  );
}

function ScopeChecklist({ selected, onChange }: { selected: Array<"LOWER" | "MIDDLE" | "UPPER">; onChange: (bands: Array<"LOWER" | "MIDDLE" | "UPPER">) => void }) {
  const bands: Array<{ value: "LOWER" | "MIDDLE" | "UPPER"; label: string; helper: string }> = [
    { value: "LOWER", label: "Lower School", helper: "S1-S2" },
    { value: "MIDDLE", label: "Middle School", helper: "S3-S4" },
    { value: "UPPER", label: "Upper School", helper: "S5-S6" }
  ];
  return (
    <fieldset className="scope-checklist">
      <legend>School division</legend>
      {bands.map((band) => (
        <label key={band.value}>
          <input type="checkbox" checked={selected.includes(band.value)} onChange={() => onChange(toggleBand(selected, band.value))} />
          <span><strong>{band.label}</strong><small>{band.helper}</small></span>
        </label>
      ))}
    </fieldset>
  );
}

function AcademicScopeBadges({ scopes }: { scopes: Array<{ band: "LOWER" | "MIDDLE" | "UPPER"; minLevel: number; maxLevel: number }> }) {
  if (scopes.length === 0) return <span className="muted-text">Whole school or not assigned</span>;
  return <div className="pill-stack">{scopes.map((scope) => <span key={scope.band} className="pill">{academicScopeLabel(scope)}</span>)}</div>;
}

function RiskAlertsView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [rows, setRows] = useState<RiskAlertRecord[]>([]);
  async function load() { setRows(asArray<RiskAlertRecord>(await api("/risk-alerts"))); }
  useEffect(() => { void load().catch((error) => setMessage(userMessage(error, "Risk alerts unavailable."))); }, []);
  async function review(id: string, status: string) {
    await api(`/risk-alerts/${id}/review`, { method: "POST", body: JSON.stringify({ status, notes: `Reviewed in desktop as ${status}` }) });
    setMessage(`Risk alert marked ${status.toLowerCase().replaceAll("_", " ")}.`);
    await load();
  }
  return <section className="operation-panel"><div className="section-heading"><h3>Financial Risk Alert Center</h3><button type="button" onClick={() => void load()}>Refresh</button></div><DataTable label="Financial risk alerts"><thead><tr><th>Risk</th><th>Entity</th><th>Amount</th><th>Reason</th><th>Status</th><th>Review</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.category}<br /><span className="pill">{row.severity}</span></td><td>{row.entityType}<br /><small>{row.entityId}</small></td><td>{ugx(row.amount)}</td><td>{row.reason}</td><td>{row.status}</td><td className="row-actions"><button type="button" onClick={() => void review(row.id, "UNDER_REVIEW")}>Review</button><button className="ghost" type="button" onClick={() => void review(row.id, "RESOLVED")}>Resolve</button><button className="ghost" type="button" onClick={() => void review(row.id, "FALSE_POSITIVE")}>False Positive</button><button className="ghost" type="button" onClick={() => void review(row.id, "ESCALATED")}>Escalate</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={6} className="empty">No financial risk alerts found.</td></tr>}</tbody></DataTable></section>;
}

function AcademicsAdminView({ api, config, session, scope, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; config: SchoolConfig | null; session: Session; scope: WorkspaceScopeSummary | null; setMessage: (message: string) => void }) {
  const [exams, setExams] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [examForm, setExamForm] = useState({ name: "", examinationType: "End of Term", startsAt: new Date().toISOString().slice(0, 10), endsAt: new Date().toISOString().slice(0, 10), status: "DRAFT", description: "" });
  const [assessmentForm, setAssessmentForm] = useState({ examinationId: "", subjectId: "", classId: "", streamId: "", teacherId: "", name: "", maxScore: "100", weight: "100", passMark: "" });
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [marksEntry, setMarksEntry] = useState<{ assessment: any; students: any[] } | null>(null);
  const [marksDraft, setMarksDraft] = useState<Record<string, { score: string; teacherComment: string }>>({});
  const [marksBusy, setMarksBusy] = useState(false);
  const permissionSet = new Set(session.user.permissions);
  const canPrepareReports = permissionSet.has(PermissionKey.ReportCardsPrepare);
  const canPublishReports = permissionSet.has(PermissionKey.ReportCardsPublish);
  const canManageAcademics = permissionSet.has(PermissionKey.AcademicsManage);
  const canReviewMarks = permissionSet.has(PermissionKey.MarksReview);
  const canEnterMarks = permissionSet.has(PermissionKey.MarksEntry);
  async function load() {
    const [nextExams, nextAssessments, nextCards] = await Promise.all([api("/academics/examinations"), api("/academics/assessments"), api("/academics/report-cards")]);
    const examRows = asArray<any>(nextExams);
    const assessmentRows = asArray<any>(nextAssessments);
    setExams(examRows);
    setAssessments(assessmentRows);
    setCards(asArray<any>(nextCards));
    setAssessmentForm((current) => ({
      ...current,
      examinationId: current.examinationId || examRows[0]?.id || "",
      subjectId: current.subjectId || config?.subjects[0]?.id || "",
      classId: current.classId || config?.classes[0]?.id || "",
      streamId: current.streamId || config?.classes[0]?.streams[0]?.id || "",
      teacherId: current.teacherId || config?.teachers?.[0]?.id || ""
    }));
    if (canEnterMarks && !selectedAssessmentId && assessmentRows[0]?.id) {
      setSelectedAssessmentId(assessmentRows[0].id);
      await loadMarksEntry(assessmentRows[0].id);
    }
  }
  async function createExam(event: React.FormEvent) {
    event.preventDefault();
    await api("/academics/examinations", {
      method: "POST",
      body: JSON.stringify({
        termId: config?.school.currentTermId,
        academicYearId: config?.school.currentAcademicYearId,
        name: examForm.name,
        examinationType: examForm.examinationType,
        startsAt: dateToIso(examForm.startsAt),
        endsAt: dateToIso(examForm.endsAt),
        status: examForm.status,
        description: examForm.description || null
      })
    });
    setExamForm({ ...examForm, name: "", description: "" });
    setMessage("Examination created for the current term.");
    await load();
  }
  async function createAssessment(event: React.FormEvent) {
    event.preventDefault();
    await api("/academics/assessments", {
      method: "POST",
      body: JSON.stringify({
        termId: config?.school.currentTermId,
        examinationId: assessmentForm.examinationId,
        subjectId: assessmentForm.subjectId,
        classId: assessmentForm.classId,
        streamId: assessmentForm.streamId || null,
        teacherId: assessmentForm.teacherId || null,
        name: assessmentForm.name,
        maxScore: Number(assessmentForm.maxScore),
        weight: Number(assessmentForm.weight),
        passMark: assessmentForm.passMark ? Number(assessmentForm.passMark) : null
      })
    });
    setAssessmentForm({ ...assessmentForm, name: "" });
    setMessage("Assessment created and ready for marks entry.");
    await load();
  }
  async function decideAssessment(id: string, decision: "APPROVED" | "REJECTED" | "RETURNED" | "PUBLISHED") {
    await api(`/academics/assessments/${id}/decision`, { method: "POST", body: JSON.stringify({ decision, comment: `DOS ${decision.toLowerCase()} from workspace` }) });
    setMessage(`Assessment ${decision.toLowerCase()} successfully.`);
    await load();
  }
  async function loadMarksEntry(assessmentId: string) {
    if (!assessmentId) {
      setMarksEntry(null);
      setMarksDraft({});
      return;
    }
    const entry = await api(`/academics/marks-entry/${assessmentId}`);
    const students = asArray<any>(entry.students);
    setMarksEntry({ assessment: entry.assessment, students });
    setMarksDraft(Object.fromEntries(students.map((student) => [student.id, {
      score: student.mark?.score === undefined || student.mark?.score === null ? "" : String(student.mark.score),
      teacherComment: student.mark?.teacherComment ?? ""
    }])));
  }
  async function chooseMarksAssessment(assessmentId: string) {
    setSelectedAssessmentId(assessmentId);
    try {
      await loadMarksEntry(assessmentId);
    } catch (error) {
      setMarksEntry(null);
      setMarksDraft({});
      setMessage(userMessage(error, "Marks entry unavailable."));
    }
  }
  function updateMarkDraft(studentId: string, patch: Partial<{ score: string; teacherComment: string }>) {
    setMarksDraft((current) => ({ ...current, [studentId]: { score: current[studentId]?.score ?? "", teacherComment: current[studentId]?.teacherComment ?? "", ...patch } }));
  }
  async function submitMarks(status: "DRAFT" | "SUBMITTED") {
    if (!marksEntry) return;
    const maxScore = Number(marksEntry.assessment.maxScore);
    const entries = marksEntry.students
      .map((student) => ({ studentId: student.id, score: Number(marksDraft[student.id]?.score), teacherComment: marksDraft[student.id]?.teacherComment?.trim() || null }))
      .filter((entry) => Number.isFinite(entry.score));
    if (entries.length === 0) {
      setMessage("Enter at least one score before saving marks.");
      return;
    }
    if (entries.some((entry) => entry.score < 0 || entry.score > maxScore)) {
      setMessage(`Scores must be between 0 and ${maxScore}.`);
      return;
    }
    setMarksBusy(true);
    try {
      await api("/academics/marks", { method: "POST", body: JSON.stringify({ assessmentId: marksEntry.assessment.id, entries, status, deviceId }) });
      setMessage(status === "SUBMITTED" ? "Marks submitted for DOS review." : "Marks draft saved.");
      await load();
      await loadMarksEntry(marksEntry.assessment.id);
    } catch (error) {
      setMessage(userMessage(error, "Marks could not be saved."));
    } finally {
      setMarksBusy(false);
    }
  }
  async function prepareReports() {
    await api("/academics/report-cards/generate", { method: "POST", body: JSON.stringify({ termId: config?.school.currentTermId }) });
    setMessage("Report cards prepared for the assigned class and sent to DOS review.");
    await load();
  }
  async function publishReport(cardId: string) {
    await api(`/academics/report-cards/${cardId}/publish`, { method: "POST", body: JSON.stringify({}) });
    setMessage("Report card approved by DOS and published to the portal.");
    await load();
  }
  useEffect(() => { void load().catch((error) => setMessage(userMessage(error, "Academics unavailable."))); }, []);
  const termName = config?.academicYears.flatMap((year) => year.terms).find((term) => term.id === config.school.currentTermId)?.name ?? "-";
  return <section className="operation-panel wide-panel">
    <div className="print-only">
      <h2>{config?.school.name ?? "Aethina School Management System"} Academic Report Output</h2>
      <p>Generated {new Date().toLocaleString()}</p>
    </div>
    <div className="section-heading">
      <h3>{canManageAcademics ? "DOS Academic Management" : canPrepareReports ? "Class Teacher Reports" : "Teacher Academics"}</h3>
      <div className="row-actions">
        <button type="button" className="ghost no-print" onClick={printPage}>Print Reports</button>
        {canPrepareReports && <button type="button" onClick={() => void prepareReports()}>Prepare Reports</button>}
        <button type="button" onClick={() => void load()}>Refresh</button>
      </div>
    </div>
    {scope && <WorkspaceScopePanel summary={scope} />}
    <div className="summary-strip"><span>Current term: {termName}</span><span>{assessments.filter((item) => item.status === "SUBMITTED").length} awaiting review</span><span>{cards.filter((item) => item.status === "PUBLISHED").length} published report cards</span></div>
    {canEnterMarks && <section className="operation-panel marks-entry-panel">
      <div className="section-heading">
        <h3>Marks Entry</h3>
        <div className="row-actions">
          <button type="button" className="ghost" onClick={() => void loadMarksEntry(selectedAssessmentId)} disabled={!selectedAssessmentId || marksBusy}>Reload Roster</button>
          <button type="button" className="ghost" onClick={() => void submitMarks("DRAFT")} disabled={!marksEntry || marksBusy}>Save Draft</button>
          <button type="button" onClick={() => void submitMarks("SUBMITTED")} disabled={!marksEntry || marksBusy}>Submit Marks</button>
        </div>
      </div>
      <div className="marks-entry-toolbar">
        <label>Assessment<select value={selectedAssessmentId} onChange={(event) => void chooseMarksAssessment(event.target.value)}><option value="">Select assessment</option>{assessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.name} - {assessment.subject?.name ?? "Subject"} ({assessment.status ?? "DRAFT"})</option>)}</select></label>
        <div><strong>{marksEntry?.assessment?.subject?.name ?? "No subject selected"}</strong><span>Max score: {marksEntry ? String(marksEntry.assessment.maxScore) : "-"}</span></div>
      </div>
      <DataTable label="Teacher marks entry" compact>
        <thead><tr><th>Student</th><th>Current Score</th><th>Score</th><th>Comment</th></tr></thead>
        <tbody>
          {marksEntry?.students.map((student) => <tr key={student.id}>
            <td>{student.admissionNo}<br /><small>{student.firstName} {student.lastName}</small></td>
            <td>{student.mark?.score ?? "-"}</td>
            <td><input className="compact-input" type="number" min="0" max={Number(marksEntry.assessment.maxScore)} value={marksDraft[student.id]?.score ?? ""} onChange={(event) => updateMarkDraft(student.id, { score: event.target.value })} /></td>
            <td><input value={marksDraft[student.id]?.teacherComment ?? ""} onChange={(event) => updateMarkDraft(student.id, { teacherComment: event.target.value })} placeholder="Optional note" /></td>
          </tr>)}
          {!marksEntry && <tr><td colSpan={4} className="empty">Select an assigned assessment to enter marks.</td></tr>}
          {marksEntry && marksEntry.students.length === 0 && <tr><td colSpan={4} className="empty">No active students are available for this assessment roster.</td></tr>}
        </tbody>
      </DataTable>
    </section>}
    {canManageAcademics && <div className="workflow-grid">
      <form className="workflow-panel" onSubmit={(event) => void createExam(event)}>
        <div><h4>Create Examination</h4><p className="panel-copy">Open an exam window for marks, review, and reports.</p></div>
        <input placeholder="Exam name" value={examForm.name} onChange={(event) => setExamForm({ ...examForm, name: event.target.value })} required />
        <select value={examForm.examinationType} onChange={(event) => setExamForm({ ...examForm, examinationType: event.target.value })}><option>End of Term</option><option>Mid Term</option><option>Mock Examination</option><option>Continuous Assessment</option></select>
        <div className="two-field-row"><input type="date" value={examForm.startsAt} onChange={(event) => setExamForm({ ...examForm, startsAt: event.target.value })} /><input type="date" value={examForm.endsAt} onChange={(event) => setExamForm({ ...examForm, endsAt: event.target.value })} /></div>
        <select value={examForm.status} onChange={(event) => setExamForm({ ...examForm, status: event.target.value })}>{["DRAFT", "OPEN", "MARKS_ENTRY", "UNDER_REVIEW"].map((status) => <option key={status}>{status}</option>)}</select>
        <textarea placeholder="Description" value={examForm.description} onChange={(event) => setExamForm({ ...examForm, description: event.target.value })} />
        <button type="submit">Create Exam</button>
      </form>
      <form className="workflow-panel" onSubmit={(event) => void createAssessment(event)}>
        <div><h4>Create Assessment</h4><p className="panel-copy">Attach a subject, class, teacher, weighting, and pass mark.</p></div>
        <select value={assessmentForm.examinationId} onChange={(event) => setAssessmentForm({ ...assessmentForm, examinationId: event.target.value })}><option value="">Select exam</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select>
        <select value={assessmentForm.subjectId} onChange={(event) => setAssessmentForm({ ...assessmentForm, subjectId: event.target.value })}><option value="">Select subject</option>{config?.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
        <select value={assessmentForm.classId} onChange={(event) => setAssessmentForm({ ...assessmentForm, classId: event.target.value, streamId: config?.classes.find((klass) => klass.id === event.target.value)?.streams[0]?.id ?? "" })}><option value="">Select class</option>{config?.classes.map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}</select>
        <select value={assessmentForm.streamId} onChange={(event) => setAssessmentForm({ ...assessmentForm, streamId: event.target.value })}><option value="">All streams</option>{config?.classes.find((klass) => klass.id === assessmentForm.classId)?.streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select>
        <select value={assessmentForm.teacherId} onChange={(event) => setAssessmentForm({ ...assessmentForm, teacherId: event.target.value })}><option value="">No teacher assigned</option>{config?.teachers?.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.staffId} - {teacher.firstName} {teacher.lastName}</option>)}</select>
        <input placeholder="Assessment name" value={assessmentForm.name} onChange={(event) => setAssessmentForm({ ...assessmentForm, name: event.target.value })} required />
        <div className="three-field-row"><input type="number" placeholder="Max" value={assessmentForm.maxScore} onChange={(event) => setAssessmentForm({ ...assessmentForm, maxScore: event.target.value })} /><input type="number" placeholder="Weight" value={assessmentForm.weight} onChange={(event) => setAssessmentForm({ ...assessmentForm, weight: event.target.value })} /><input type="number" placeholder="Pass" value={assessmentForm.passMark} onChange={(event) => setAssessmentForm({ ...assessmentForm, passMark: event.target.value })} /></div>
        <button type="submit">Create Assessment</button>
      </form>
    </div>}
    <DataTable label="Examinations"><thead><tr><th>Exam</th><th>Type</th><th>Status</th><th>Window</th><th>Assessments</th></tr></thead><tbody>
      {exams.map((exam) => <tr key={exam.id}><td>{exam.name}</td><td>{exam.examinationType ?? "-"}</td><td><span className="pill">{exam.status ?? "-"}</span></td><td>{dateOnly(exam.startsAt)} - {dateOnly(exam.endsAt)}</td><td>{exam.assessments?.length ?? 0}</td></tr>)}
      {exams.length === 0 && <tr><td colSpan={5} className="empty">No examinations created yet.</td></tr>}
    </tbody></DataTable>
    <DataTable label="Assessments"><thead><tr><th>Assessment</th><th>Subject</th><th>Status</th><th>Marks</th><th>Action</th></tr></thead><tbody>
      {assessments.map((item) => <tr key={item.id}><td>{item.name}<br /><small>{item.examination?.name ?? "-"}</small></td><td>{item.subject?.name ?? "-"}</td><td><span className="pill">{item.status ?? "-"}</span></td><td>{item.marks?.length ?? 0}</td><td className="row-actions">{canEnterMarks ? <button type="button" className="ghost" onClick={() => void chooseMarksAssessment(item.id)}>Enter Marks</button> : canReviewMarks && item.status === "SUBMITTED" ? <><button type="button" onClick={() => void decideAssessment(item.id, "APPROVED")}>Approve</button><button className="ghost" type="button" onClick={() => void decideAssessment(item.id, "RETURNED")}>Return</button><button className="ghost" type="button" onClick={() => void decideAssessment(item.id, "PUBLISHED")}>Publish</button></> : "-"}</td></tr>)}
      {assessments.length === 0 && <tr><td colSpan={5} className="empty">No assessments created yet.</td></tr>}
    </tbody></DataTable>
    <DataTable label="Report cards"><thead><tr><th>Student</th><th>Grade</th><th>Average</th><th>Status</th><th>DOS action</th></tr></thead><tbody>
      {cards.slice(0, 20).map((card) => <tr key={card.id}><td>{card.student?.firstName ?? ""} {card.student?.lastName ?? ""}</td><td>{card.grade}</td><td>{String(card.averageScore)}</td><td><span className="pill">{card.status}</span></td><td>{canPublishReports && card.status === "PREPARED" ? <button type="button" onClick={() => void publishReport(card.id)}>Approve & Publish</button> : "-"}</td></tr>)}
      {cards.length === 0 && <tr><td colSpan={5} className="empty">No report cards to display.</td></tr>}
    </tbody></DataTable>
  </section>;
}

function TimetableAdminView({ api, config, scope, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; config: SchoolConfig | null; scope: WorkspaceScopeSummary | null; setMessage: (message: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ classId: "", streamId: "", subjectId: "", teacherId: "", room: "", dayOfWeek: "1", periodNumber: "1", startsAt: "08:00", endsAt: "08:40" });
  async function load() { setRows(asArray<any>(await api("/timetable"))); }
  useEffect(() => { void load().catch((error) => setMessage(userMessage(error, "Timetable unavailable."))); }, []);
  useEffect(() => {
    if (!config) return;
    setForm((current) => ({
      ...current,
      classId: current.classId || config.classes[0]?.id || "",
      streamId: current.streamId || config.classes[0]?.streams[0]?.id || "",
      subjectId: current.subjectId || config.subjects[0]?.id || "",
      teacherId: current.teacherId || config.teachers?.[0]?.id || ""
    }));
  }, [config]);
  async function createEntry(event: React.FormEvent) {
    event.preventDefault();
    await api("/timetable", {
      method: "POST",
      body: JSON.stringify({
        academicYearId: config?.school.currentAcademicYearId,
        termId: config?.school.currentTermId,
        classId: form.classId,
        streamId: form.streamId || null,
        subjectId: form.subjectId,
        teacherId: form.teacherId,
        room: form.room || null,
        dayOfWeek: Number(form.dayOfWeek),
        periodNumber: Number(form.periodNumber),
        startsAt: form.startsAt,
        endsAt: form.endsAt
      })
    });
    setMessage("Timetable entry created.");
    await load();
  }
  const subjects = new Map((config?.subjects ?? []).map((subject) => [subject.id, subject.name]));
  const teachers = new Map((config?.teachers ?? []).map((teacher) => [teacher.id, `${teacher.staffId} - ${teacher.firstName} ${teacher.lastName}`]));
  const classes = new Map((config?.classes ?? []).map((klass) => [klass.id, klass.name]));
  const currentClass = config?.classes.find((klass) => klass.id === form.classId);
  return <section className="operation-panel wide-panel">
    <div className="section-heading"><h3>Timetable</h3><div className="row-actions"><button type="button" className="ghost no-print" onClick={printPage}>Print</button><button type="button" onClick={() => void load()}>Refresh</button></div></div>
    {scope && <WorkspaceScopePanel summary={scope} />}
    <form className="workflow-form" onSubmit={(event) => void createEntry(event)}>
      <select value={form.classId} onChange={(event) => setForm({ ...form, classId: event.target.value, streamId: config?.classes.find((klass) => klass.id === event.target.value)?.streams[0]?.id ?? "" })}><option value="">Class</option>{config?.classes.map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}</select>
      <select value={form.streamId} onChange={(event) => setForm({ ...form, streamId: event.target.value })}><option value="">All streams</option>{currentClass?.streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select>
      <select value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })}><option value="">Subject</option>{config?.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
      <select value={form.teacherId} onChange={(event) => setForm({ ...form, teacherId: event.target.value })}><option value="">Teacher</option>{config?.teachers?.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.staffId} - {teacher.firstName} {teacher.lastName}</option>)}</select>
      <select value={form.dayOfWeek} onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => <option key={day} value={String(index + 1)}>{day}</option>)}</select>
      <input type="number" min="1" placeholder="Period" value={form.periodNumber} onChange={(event) => setForm({ ...form, periodNumber: event.target.value })} />
      <input type="time" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
      <input type="time" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
      <input placeholder="Room" value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} />
      <button type="submit">Add Lesson</button>
    </form>
    <DataTable label="Timetable entries"><thead><tr><th scope="col">Day</th><th scope="col">Period</th><th scope="col">Class</th><th scope="col">Subject</th><th scope="col">Teacher</th><th scope="col">Time</th><th scope="col">Room</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id}><td>{weekdayLabel(row.dayOfWeek)}</td><td>{row.periodNumber}</td><td>{classes.get(row.classId) ?? "Class not found"}</td><td>{subjects.get(row.subjectId) ?? "Subject not found"}</td><td>{teachers.get(row.teacherId) ?? "Teacher not found"}</td><td>{row.startsAt}-{row.endsAt}</td><td>{row.room ?? "Not assigned"}</td></tr>)}
      {rows.length === 0 && <tr><td colSpan={7} className="empty">No timetable entries yet.</td></tr>}
    </tbody></DataTable>
  </section>;
}

function InventoryAdminView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  async function load() {
    const [nextItems, nextMovements] = await Promise.all([api("/inventory/items"), api("/inventory/movements")]);
    setItems(asArray<any>(nextItems));
    setMovements(asArray<any>(nextMovements));
  }
  useEffect(() => { void load().catch((error) => setMessage(userMessage(error, "Inventory unavailable."))); }, []);
  return <section className="operation-panel wide-panel"><div className="section-heading"><h3>Inventory</h3><button type="button" onClick={() => void load()}>Refresh</button></div><FinanceTable headings={["SKU", "Item", "Category", "Qty", "Reorder"]} rows={items.map((item) => [item.sku, item.name, item.category, item.quantity, item.reorderLevel])} /><FinanceTable headings={["Item", "Type", "Qty", "Status", "Reason"]} rows={movements.slice(0, 30).map((row) => [row.inventoryItem?.name ?? row.inventoryItemId, row.movementType, row.quantity, row.approvalStatus, row.reason])} /></section>;
}

function PayrollAdminView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  async function load() {
    const [nextRuns, nextRecords] = await Promise.all([api("/payroll/runs"), api("/payroll/records")]);
    setRuns(asArray<any>(nextRuns));
    setRecords(asArray<any>(nextRecords));
  }
  useEffect(() => { void load().catch((error) => setMessage(userMessage(error, "Payroll unavailable."))); }, []);
  return <section className="operation-panel wide-panel"><div className="section-heading"><h3>Payroll</h3><button type="button" onClick={() => void load()}>Refresh</button></div><FinanceTable headings={["Period", "Status", "Gross", "Deductions", "Net"]} rows={runs.map((run) => [run.period, run.status, ugx(run.grossTotal), ugx(run.deductionTotal), ugx(run.netTotal)])} /><FinanceTable headings={["Teacher", "Period", "Gross", "Deductions", "Net", "Status"]} rows={records.slice(0, 30).map((row) => [row.teacherId, row.period, ugx(row.grossPay), ugx(row.deductions), ugx(row.netPay), row.status])} /></section>;
}

function NotificationsAdminView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  async function load() {
    const [nextNotifications, nextAnnouncements] = await Promise.all([api("/notifications"), api("/announcements?all=true")]);
    setNotifications(asArray<any>(nextNotifications));
    setAnnouncements(asArray<any>(nextAnnouncements));
  }
  useEffect(() => { void load().catch((error) => setMessage(userMessage(error, "Notifications unavailable."))); }, []);
  return <section className="operation-panel wide-panel"><div className="section-heading"><h3>Notifications & Announcements</h3><button type="button" onClick={() => void load()}>Refresh</button></div><FinanceTable headings={["Title", "Recipient", "Channel", "Status"]} rows={notifications.slice(0, 30).map((row) => [row.title, `${row.recipientType}${row.recipientId ? `:${row.recipientId}` : ""}`, row.channel, row.status])} /><FinanceTable headings={["Announcement", "Audience", "Priority", "Published"]} rows={announcements.map((row) => [row.title, row.audience, row.priority, dateOnly(row.publishAt)])} /></section>;
}

function DataTable({ label, compact = false, children }: { label: string; compact?: boolean; children: React.ReactNode }) {
  return (
    <div className={compact ? "data-table compact" : "data-table"} role="region" aria-label={label} tabIndex={0}>
      <table>{children}</table>
    </div>
  );
}

function InvoiceTable({ invoices }: { invoices: InvoiceRecord[] }) {
  return <DataTable label="Student invoices"><thead><tr><th>Invoice</th><th>Student</th><th>Expected</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.invoiceNo}</td><td>{invoice.student.admissionNo}<br /><small>{invoice.student.firstName} {invoice.student.lastName}</small></td><td>{ugx(invoice.amount)}</td><td>{ugx(invoice.amountPaid)}</td><td>{ugx(invoice.balance)}</td><td><span className="pill">{invoice.status}</span></td></tr>)}{invoices.length === 0 && <tr><td colSpan={6} className="empty">No invoices yet.</td></tr>}</tbody></DataTable>;
}

function FinanceTable({ headings, rows }: { headings: string[]; rows: Array<Array<string | number>> }) {
  return <DataTable label={headings.join(", ")}><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan={headings.length} className="empty">No records to display.</td></tr>}</tbody></DataTable>;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function sectionsForUser(permissions: string[]) {
  const permissionSet = new Set(permissions);
  return appSections.filter((section) => section.permissions.some((permission) => permissionSet.has(permission)));
}

function isTeachingWorkspace(user: Session["user"]) {
  const roles = user.roles.map(normalizeRoleName);
  return roles.includes("teacher") || roles.includes("class teacher");
}

function rosterScopeKey(filter: StudentQuickFilter | undefined) {
  return filter ? `${filter.classId}:${filter.streamId ?? ""}` : "";
}

function parseRosterRows(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = lines.filter((line, index) => {
    const normalized = line.toLowerCase().replace(/\s/g, "");
    return !(index === 0 && normalized.includes("firstname") && normalized.includes("lastname"));
  });
  return rows.map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length === 2) {
      return { firstName: cells[0] ?? "", lastName: cells[1] ?? "" };
    }
    return {
      admissionNo: cells[0] || undefined,
      firstName: cells[1] ?? "",
      lastName: cells[2] ?? "",
      middleName: cells[3] || undefined
    };
  });
}

function workspaceScopeFor(user: Session["user"], config: SchoolConfig): WorkspaceScopeSummary | null {
  const normalizedRoles = user.roles.map(normalizeRoleName);
  const roleText = normalizedRoles.join(" ");
  const teacher = config.teachers?.find((item) => item.userId === user.id);
  const subjectAssignments = teacher ? (config.teacherSubjectAssignments ?? []).filter((assignment) => assignment.teacherId === teacher.id) : [];
  const classAssignments = teacher ? (config.classTeacherAssignments ?? []).filter((assignment) => assignment.teacherId === teacher.id) : [];
  const explicitScopes = (config.academicScopeAssignments ?? []).filter((scope) => scope.userId === user.id);
  const dosClasses = explicitScopes.length
    ? classesForAcademicScopes(explicitScopes, config.classes)
    : classesForDosRole(roleText, config.classes);

  if (dosClasses.length > 0) {
    const label = explicitScopes.length ? explicitScopes.map(academicScopeLabel).join(", ") : dosBandLabel(roleText);
    return {
      title: label,
      description: "Academic records, reports, setup, and timetable actions are limited to this school division.",
      chips: dosClasses.map((klass) => `${klass.name}${klass.streams.length ? ` - ${klass.streams.length} stream${klass.streams.length === 1 ? "" : "s"}` : ""}`),
      studentFilters: dosClasses.map((klass) => ({ label: klass.name, classId: klass.id }))
    };
  }

  if (classAssignments.length > 0) {
    const filters = classAssignments.map((assignment) => ({
      label: classStreamLabel(config, assignment.classId, assignment.streamId),
      classId: assignment.classId,
      streamId: assignment.streamId
    }));
    return {
      title: `Class Teacher: ${filters.map((item) => item.label).join(", ")}`,
      description: "This workspace centers on assigned learners, report-card preparation, timetable follow-up, and guardian support.",
      chips: [...filters.map((item) => item.label), `${subjectAssignments.length} assigned subject${subjectAssignments.length === 1 ? "" : "s"}`],
      studentFilters: filters
    };
  }

  if (subjectAssignments.length > 0) {
    const subjectLabels = subjectAssignments.map((assignment) => {
      const subject = config.subjects.find((item) => item.id === assignment.subjectId);
      return `${subject?.name ?? "Subject"} - ${classStreamLabel(config, assignment.classId, assignment.streamId)}`;
    });
    return {
      title: "Assigned Teaching Load",
      description: "Marks entry, rosters, and timetable views are scoped to assigned subjects and classes.",
      chips: subjectLabels,
      studentFilters: uniqueFilters(subjectAssignments.map((assignment) => ({
        label: classStreamLabel(config, assignment.classId, assignment.streamId),
        classId: assignment.classId,
        streamId: assignment.streamId
      })))
    };
  }

  if (roleText.includes("bursar") || roleText.includes("accountant")) {
    return {
      title: "Finance Office",
      description: "Fees, receipts, balances, reminders, budgets, and cash-flow records are handled from this workspace.",
      chips: ["UGX fee accounts", "Receipts", "Budgets", "Cash flow"],
      studentFilters: []
    };
  }

  return null;
}

function classesForDosRole(roleText: string, classes: SchoolConfig["classes"]) {
  if (roleText.includes("lower")) return classes.filter((klass) => klass.level >= 1 && klass.level <= 2);
  if (roleText.includes("middle")) return classes.filter((klass) => klass.level >= 3 && klass.level <= 4);
  if (roleText.includes("upper")) return classes.filter((klass) => klass.level >= 5 && klass.level <= 6);
  return [];
}

function classesForAcademicScopes(scopes: Array<{ minLevel: number; maxLevel: number }>, classes: SchoolConfig["classes"]) {
  return classes.filter((klass) => scopes.some((scope) => klass.level >= scope.minLevel && klass.level <= scope.maxLevel));
}

function dosBandLabel(roleText: string) {
  if (roleText.includes("lower")) return "Lower School DOS: S1-S2";
  if (roleText.includes("middle")) return "Middle School DOS: S3-S4";
  if (roleText.includes("upper")) return "Upper School DOS: S5-S6";
  return "Dean of Studies";
}

function classStreamLabel(config: SchoolConfig, classId: string, streamId?: string | null) {
  const klass = config.classes.find((item) => item.id === classId);
  const stream = klass?.streams.find((item) => item.id === streamId);
  return [klass?.name ?? "Class", stream?.name].filter(Boolean).join(" ");
}

function uniqueFilters(filters: StudentQuickFilter[]) {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    const key = `${filter.classId}:${filter.streamId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function roleWorkspaceFor(persona: Persona, sections: AppSection[]): RoleWorkspace {
  const available = new Map(sections.map((section) => [section.id, section]));
  const actionViews = workspaceActionViews(persona, sections);
  const focusViews = workspaceFocusViews(persona, sections);
  const actionFor = (view: ActiveView) => available.get(view);
  const focus = focusViews
    .map((view) => actionFor(view))
    .filter((section): section is AppSection => Boolean(section))
    .map((section) => ({ label: section.group, value: section.label, view: section.id }));
  const actions = actionViews
    .map((view) => actionFor(view))
    .filter((section): section is AppSection => Boolean(section))
    .map((section) => ({ label: section.label, view: section.id }));
  return {
    focus: focus.length ? focus : sections.slice(0, 3).map((section) => ({ label: section.group, value: section.label, view: section.id })),
    actions: actions.length ? actions : sections.slice(0, 5).map((section) => ({ label: section.label, view: section.id })),
    ...workspaceCopy(persona)
  };
}

function workspaceActionViews(persona: Persona, sections: AppSection[]): ActiveView[] {
  const title = persona.title.toLowerCase();
  if (title.includes("administrator")) return ["users", "dashboard", "approvals", "risk", "sync"];
  if (title.includes("academic control")) return ["students", "school", "academics", "timetable", "notifications"];
  if (title.includes("class teacher")) return ["academics", "students", "timetable", "attendance"];
  if (title.includes("head teacher")) return ["dashboard", "academics", "approvals", "notifications"];
  if (title.includes("bursar") || title.includes("accounts")) return ["finance", "budgets", "payroll", "approvals", "risk"];
  if (title.includes("teacher")) return ["academics", "timetable", "students", "attendance"];
  return sections.slice(0, 5).map((section) => section.id);
}

function workspaceFocusViews(persona: Persona, sections: AppSection[]): ActiveView[] {
  const title = persona.title.toLowerCase();
  if (title.includes("administrator")) return ["dashboard", "users", "audit"];
  if (title.includes("academic control")) return ["school", "students", "academics"];
  if (title.includes("class teacher")) return ["academics", "students", "timetable"];
  if (title.includes("head teacher")) return ["dashboard", "academics", "approvals"];
  if (title.includes("bursar") || title.includes("accounts")) return ["finance", "budgets", "payroll"];
  if (title.includes("teacher")) return ["academics", "timetable", "attendance"];
  return sections.slice(0, 3).map((section) => section.id);
}

function workspaceCopy(persona: Persona) {
  const title = persona.title.toLowerCase();
  if (title.includes("administrator")) {
    return {
      routines: ["Review users and role access.", "Check approvals, risks, sync conflicts, and audit activity.", "Confirm school setup is ready for the current term."],
      alerts: ["Inactive staff with active responsibilities.", "Open sensitive sync conflicts.", "Unreviewed finance or approval exceptions."]
    };
  }
  if (title.includes("academic control")) {
    return {
      routines: ["Review admissions and class placement.", "Maintain subjects, streams, terms, and grade boundaries.", "Approve assessments and publish final report cards."],
      alerts: ["Marks awaiting review.", "Timetable conflicts or missing subject allocation.", "Students without current class or stream placement."]
    };
  }
  if (title.includes("class teacher")) {
    return {
      routines: ["Review assigned learners.", "Prepare report cards for DOS approval.", "Track timetable and daily academic follow-up."],
      alerts: ["Unprepared report cards.", "Missing marks in assigned class subjects.", "Students needing guardian or portal follow-up."]
    };
  }
  if (title.includes("head teacher")) {
    return {
      routines: ["Scan school-wide dashboard and academic progress.", "Review approvals that need leadership attention.", "Coordinate communications for staff and families."],
      alerts: ["Academic records stuck in review.", "High-priority announcements.", "Budget or risk items awaiting leadership context."]
    };
  }
  if (title.includes("bursar") || title.includes("accounts")) {
    return {
      routines: ["Review fee collection and balances.", "Record payments and expenses.", "Track budgets, payroll, and finance approvals."],
      alerts: ["Overdue invoices and low collection percentage.", "Budget utilization above threshold.", "Payroll or expense approvals waiting."]
    };
  }
  if (title.includes("teacher")) {
    return {
      routines: ["Open timetable and assigned academic work.", "Enter marks for assigned assessments.", "Use staff attendance workflows when needed."],
      alerts: ["Marks entry deadlines.", "Class or subject allocation changes.", "Attendance corrections needing follow-up."]
    };
  }
  return {
    routines: ["Open the sections available to your role.", "Keep assigned workflows up to date.", "Ask an administrator if a section is missing."],
    alerts: ["Permissions determine visible tools.", "Some workflows may require approval.", "Offline changes should be synchronized regularly."]
  };
}

function personaFor(roles: string[], permissions: string[]): Persona {
  const normalizedRoles = roles.map(normalizeRoleName);
  const hasRole = (...names: string[]) => normalizedRoles.some((role) => names.includes(role));
  const permissionSet = new Set(permissions);

  if (hasRole("administrator")) {
    return {
      kicker: "Full command center",
      title: "School Administrator Console",
      summary: "School-wide oversight, users, governance approvals, finance visibility, risk, sync, and audit."
    };
  }
  if (hasRole("head teacher")) {
    return {
      kicker: "Academic leadership",
      title: "Head Teacher Workspace",
      summary: "Academic supervision, student progress, timetable coordination, approvals, and school communication."
    };
  }
  if (hasRole("bursar", "accountant")) {
    return {
      kicker: "Finance office",
      title: "Bursar & Accounts Workspace",
      summary: "Fees, invoices, payments, expenses, budgets, payroll records, and finance reporting."
    };
  }
  if (hasRole("dos", "dean of studies")) {
    return {
      kicker: "Dean of Studies",
      title: "DOS Academic Control Room",
      summary: "Admissions, class setup, subject allocation, timetables, grading, examinations, and final report-card approval."
    };
  }
  if (hasRole("class teacher")) {
    return {
      kicker: "Class teacher",
      title: "Class Teacher Workspace",
      summary: "Review marks for assigned learners, prepare report cards, and send academic records to the DOS for final publishing."
    };
  }
  if (hasRole("teacher")) {
    return {
      kicker: "Teaching workspace",
      title: "Teacher Workspace",
      summary: "Student lists, marks entry, academic records, timetable, and staff attendance access."
    };
  }
  if (permissionSet.has(PermissionKey.AcademicSetupManage)) {
    return {
      kicker: "Dean of Studies",
      title: "DOS Academic Control Room",
      summary: "Admissions, class setup, subject allocation, timetables, grading, examinations, and final report-card approval."
    };
  }
  if (permissionSet.has(PermissionKey.ReportCardsPrepare)) {
    return {
      kicker: "Class teacher",
      title: "Class Teacher Workspace",
      summary: "Review marks for assigned learners, prepare report cards, and send academic records to the DOS for final publishing."
    };
  }
  if (permissionSet.has(PermissionKey.FinanceManage)) {
    return {
      kicker: "Finance office",
      title: "Bursar & Accounts Workspace",
      summary: "Fees, invoices, payments, expenses, budgets, payroll records, and finance reporting."
    };
  }
  if (permissionSet.has(PermissionKey.MarksEntry)) {
    return {
      kicker: "Teaching workspace",
      title: "Teacher Workspace",
      summary: "Student lists, marks entry, academic records, timetable, and staff attendance access."
    };
  }
  return {
    kicker: "Role workspace",
    title: "Satelite Secondary Workspace",
    summary: "Your available sections are based on the permissions assigned by the school administrator."
  };
}

function normalizeRoleName(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

function isFinanceOnly(roles: string[], permissions: string[]) {
  const roleText = roles.join(" ").toLowerCase();
  const permissionSet = new Set(permissions);
  return (roleText.includes("bursar") || roleText.includes("accountant")) &&
    permissionSet.has(PermissionKey.FinanceRead) &&
    !permissionSet.has(PermissionKey.AcademicSetupManage) &&
    !permissionSet.has(PermissionKey.MarksEntry) &&
    !permissionSet.has(PermissionKey.ReportCardsPrepare) &&
    !permissionSet.has(PermissionKey.ReportCardsPublish);
}

function workspaceIdentityFor(roles: string[], permissions: string[]) {
  const normalizedRoles = roles.map(normalizeRoleName);
  const hasRole = (...names: string[]) => normalizedRoles.some((role) => names.includes(role));
  const permissionSet = new Set(permissions);

  if (hasRole("administrator")) return "Administration";
  if (hasRole("dos", "dean of studies")) return "Academic Office";
  if (hasRole("bursar", "accountant")) return "Finance Office";
  if (hasRole("head teacher")) return "Executive Review";
  if (hasRole("teacher", "class teacher")) return "Teacher Workspace";
  if (permissionSet.has(PermissionKey.UsersManage)) return "Administration";
  if (permissionSet.has(PermissionKey.AcademicSetupManage) || permissionSet.has(PermissionKey.ReportCardsPublish)) return "Academic Office";
  if (permissionSet.has(PermissionKey.FinanceManage)) return "Finance Office";
  if (permissionSet.has(PermissionKey.ApprovalReview)) return "Executive Review";
  if (permissionSet.has(PermissionKey.MarksEntry) || permissionSet.has(PermissionKey.ReportCardsPrepare)) return "Teacher Workspace";
  return "Staff Workspace";
}

function viewTitle(view: ActiveView) {
  return {
    dashboard: "Administrative Dashboard",
    users: "Users & Roles",
    students: "Student Management",
    academics: "Academic Management",
    timetable: "Timetable",
    finance: "Fees & Finance",
    budgets: "Budget Controls",
    inventory: "Inventory",
    payroll: "Payroll",
    notifications: "Notifications",
    approvals: "Approval Inbox",
    school: "School Configuration",
    attendance: "Teacher Attendance",
    sync: "Synchronization Review",
    risk: "Financial Risk Alerts",
    audit: "Audit Log"
  }[view];
}

function roleNames(user: UserRecord) {
  return user.roles.map((item) => item.role.name).filter(Boolean);
}

function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    LOGIN_SUCCESS: "Signed in successfully",
    LOGIN_FAILURE: "Sign-in attempt failed",
    LOGOUT: "Signed out",
    PASSWORD_CHANGED: "Changed password",
    USER_CREATED: "Created a staff user",
    USER_ROLES_UPDATED: "Updated staff role access",
    USER_PASSWORD_RESET: "Reset a staff password",
    STUDENT_CREATED: "Registered a student",
    STUDENT_UPDATED: "Updated student details",
    PORTAL_CREDENTIAL_RESET: "Reset portal credentials",
    FINANCE_PAYMENT_CREATED: "Recorded a payment",
    FINANCE_EXPENSE_CREATED: "Recorded an expense",
    MARKS_SUBMITTED: "Submitted marks",
    MARKS_APPROVED: "Approved marks",
    REPORT_CARD_PUBLISHED: "Published a report card",
    SYNC_CONFLICT_DECIDED: "Reviewed a sync conflict",
    RISK_ALERT_REVIEWED: "Reviewed a risk alert"
  };
  return labels[action] ?? formatEntityName(action);
}

function formatEntityName(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function weekdayLabel(value: number | string) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const index = Number(value) - 1;
  return days[index] ?? `Day ${value}`;
}

function summarizeRoles(users: UserRecord[]) {
  const counts = new Map<string, number>();
  for (const user of users) {
    for (const role of roleNames(user)) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

function formatRoleName(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function academicScopeText(scopes: Array<{ band: "LOWER" | "MIDDLE" | "UPPER"; minLevel: number; maxLevel: number }>) {
  return scopes.length ? scopes.map(academicScopeLabel).join(", ") : "No explicit scope assigned";
}

function academicScopeLabel(scope: { band: "LOWER" | "MIDDLE" | "UPPER"; minLevel: number; maxLevel: number }) {
  const labels = { LOWER: "Lower S1-S2", MIDDLE: "Middle S3-S4", UPPER: "Upper S5-S6" };
  return labels[scope.band] ?? `${scope.minLevel}-${scope.maxLevel}`;
}

function isAcademicScopeCandidate(user: UserRecord) {
  const text = roleNames(user).join(" ").toLowerCase();
  return text.includes("dean of studies") || text.includes("dos");
}

function toggleId(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function toggleBand(selected: Array<"LOWER" | "MIDDLE" | "UPPER">, band: "LOWER" | "MIDDLE" | "UPPER") {
  return selected.includes(band) ? selected.filter((value) => value !== band) : [...selected, band];
}

type MetricState = "loading" | "ready" | "unavailable";

function stateLabel(state: MetricState) {
  return state === "loading" ? "Loading" : "Unavailable";
}

function countMetric(value: number | string | null | undefined, state: MetricState) {
  if (state !== "ready") return stateLabel(state);
  return value === null || value === undefined || value === "" ? "No data" : String(value);
}

function moneyMetric(value: number | string | null | undefined, state: MetricState) {
  if (state !== "ready") return stateLabel(state);
  return value === null || value === undefined || value === "" ? "No amount" : ugx(value);
}

function percentMetric(value: number | string | null | undefined, state: MetricState) {
  if (state !== "ready") return stateLabel(state);
  return value === null || value === undefined || value === "" ? "No rate" : `${value}%`;
}

function ugx(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "-";
  return `UGX ${Math.round(Number(value)).toLocaleString("en-UG")}`;
}

function printPage() {
  window.print();
}

function positiveNumber(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";
}

function dateOnly(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function dateToIso(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function withIsoDates(body: Record<string, unknown>) {
  const next = { ...body };
  for (const key of ["startsAt", "endsAt"]) {
    if (typeof next[key] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(next[key])) {
      next[key] = new Date(`${next[key]}T00:00:00.000Z`).toISOString();
    }
  }
  return next;
}

function stripEmpty(value: Record<string, string>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry));
}

type RootElement = HTMLElement & { __aethinaRoot?: ReturnType<typeof createRoot> };
const rootElement = document.getElementById("root")! as RootElement;
const root = rootElement.__aethinaRoot ?? createRoot(rootElement);
rootElement.__aethinaRoot = root;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
