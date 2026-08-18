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
import "./styles.css";

const deviceId = "00000000-0000-4000-8000-000000000001";

type Session = {
  accessToken: string;
  user: { id: string; schoolId: string; displayName: string; email: string; roles: string[]; permissions: string[]; mustChangePassword: boolean };
};

type ActiveView = "dashboard" | "students" | "academics" | "timetable" | "finance" | "budgets" | "inventory" | "payroll" | "notifications" | "approvals" | "attendance" | "school" | "sync" | "risk" | "audit";

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

const appSections: AppSection[] = [
  { id: "dashboard", label: "Dashboard", group: "Command", permissions: [PermissionKey.DashboardRead] },
  { id: "students", label: "Students", group: "Learners", permissions: [PermissionKey.StudentsRead] },
  { id: "academics", label: "Academics", group: "Academics", permissions: [PermissionKey.AcademicsRead, PermissionKey.AcademicsManage, PermissionKey.MarksEntry] },
  { id: "timetable", label: "Timetable", group: "Academics", permissions: [PermissionKey.AcademicsRead, PermissionKey.TimetableManage] },
  { id: "finance", label: "Finance", group: "Finance", permissions: [PermissionKey.FinanceRead, PermissionKey.FinanceManage] },
  { id: "budgets", label: "Budgets", group: "Finance", permissions: [PermissionKey.BudgetManage] },
  { id: "inventory", label: "Inventory", group: "Operations", permissions: [PermissionKey.InventoryManage] },
  { id: "payroll", label: "Payroll", group: "Finance", permissions: [PermissionKey.PayrollRead, PermissionKey.PayrollManage] },
  { id: "notifications", label: "Notifications", group: "Operations", permissions: [PermissionKey.NotificationsManage, PermissionKey.AnnouncementsManage] },
  { id: "approvals", label: "Approvals", group: "Governance", permissions: [PermissionKey.ApprovalReview] },
  { id: "school", label: "School Setup", group: "Command", permissions: [PermissionKey.SchoolConfigManage] },
  { id: "attendance", label: "Staff Attendance", group: "Operations", permissions: [PermissionKey.AttendanceManage] },
  { id: "sync", label: "Sync Review", group: "Governance", permissions: [PermissionKey.SyncReview] },
  { id: "risk", label: "Risk Alerts", group: "Governance", permissions: [PermissionKey.RiskReview] },
  { id: "audit", label: "Audit", group: "Governance", permissions: [PermissionKey.AuditRead] }
];

type SchoolConfig = {
  school: { id: string; name: string; code: string; phone?: string; email?: string; address?: string; admissionNumberPrefix?: string; currentAcademicYearId?: string; currentTermId?: string };
  academicYears: Array<{ id: string; name: string; startsAt?: string; endsAt?: string; isActive: boolean; terms: Array<{ id: string; name: string; startsAt?: string; endsAt?: string; isCurrent: boolean }> }>;
  classes: Array<{ id: string; name: string; level: number; streams: Array<{ id: string; name: string }> }>;
  subjects: Array<{ id: string; code: string; name: string }>;
  gradeBoundaries: Array<{ id: string; grade: string; minScore: string; maxScore: string; remark?: string }>;
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
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState("Never");
  const visibleSections = useMemo(() => session ? sectionsForUser(session.user.permissions) : [], [session]);
  const persona = session ? personaFor(session.user.roles, session.user.permissions) : null;

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
      setActiveView(visibleSections[0].id);
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
      setMessage("Data refreshed");
      await refreshOfflineState();
    } catch (error) {
      setOnline(false);
      setMessage(`Offline mode: ${error instanceof Error ? error.message : "API unavailable"}`);
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
      throw new Error(await response.text());
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
      setMessage("Please complete required student and guardian fields.");
      return;
    }
    try {
      const result = selected?.syncStatus === "PENDING"
        ? await saveOffline(registration, "UPDATE")
        : await api(selected ? `/students/${selected.id}` : "/students", {
            method: selected ? "PUT" : "POST",
            body: JSON.stringify(registration)
          });
      setMessage(selected ? "Student updated" : `Student registered. Temporary portal password: ${result.portalTemporaryPassword ?? "created offline"}`);
      setForm(emptyForm);
      setSelected(null);
      await refreshAll();
    } catch {
      await saveOffline(registration, selected ? "UPDATE" : "CREATE");
      setMessage("API unavailable. Student saved locally and queued for synchronization.");
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
      setMessage("Nothing pending synchronization.");
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
      setMessage(remaining.length ? `${remaining.length} record(s) still need review.` : "Pending students synchronized successfully.");
    } catch (error) {
      setOnline(false);
      setMessage(`Synchronization failed: ${error instanceof Error ? error.message : "API unavailable"}`);
    }
  }

  async function resetPortal(student: Student) {
    const result = await api(`/students/${student.id}/reset-portal-credentials`, { method: "POST" });
    setMessage(`Portal reset for ${student.admissionNo}. Temporary password: ${result.temporaryPassword}`);
    await refreshAll();
  }

  if (!session) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Satelite Secondary</p>
          <h1>Administration</h1>
        </div>
        <nav>
          {visibleSections.map((section) => <button key={section.id} className={activeView === section.id ? "active" : ""} onClick={() => setActiveView(section.id)}>{section.label}</button>)}
        </nav>
        <button className="ghost" onClick={logout}>Logout</button>
      </aside>

      <section className="workspace">
        <header className="mobile-admin-bar">
          <div>
            <p className="eyebrow">Satelite Secondary</p>
            <strong>{session.user.displayName}</strong>
          </div>
          <button className="ghost" onClick={logout}>Logout</button>
        </header>
        <header className="topbar">
          <div>
            <p className="eyebrow">{config?.school.name ?? "School workspace"}</p>
            <h2>{viewTitle(activeView)}</h2>
            {persona && <p className="role-caption">{persona.title} - {persona.summary}</p>}
          </div>
          <div className="status-strip">
            <span className={online ? "status online" : "status offline"}>{online ? "Online" : "Offline"}</span>
            <span>{pendingCount} pending</span>
            <span>Last sync: {lastSync}</span>
            <button onClick={synchronize}>Sync</button>
          </div>
        </header>

        <div className="mobile-section-nav">
          <label>
            Section
            <select value={activeView} onChange={(event) => setActiveView(event.target.value as ActiveView)}>
              {visibleSections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
            </select>
          </label>
        </div>

        {persona && <RoleHomeCard persona={persona} sections={visibleSections} setActiveView={setActiveView} />}

        {message && <div className="notice">{message}</div>}

        <section className="config-band">
          <div><strong>Academic year</strong><span>{config?.academicYears.find((year) => year.id === config.school.currentAcademicYearId)?.name ?? "Not set"}</span></div>
          <div><strong>Current term</strong><span>{config?.academicYears.flatMap((year) => year.terms).find((term) => term.id === config.school.currentTermId)?.name ?? "Not set"}</span></div>
          <div><strong>Classes</strong><span>{config?.classes.length ?? 0}</span></div>
          <div><strong>Subjects</strong><span>{config?.subjects.length ?? 0}</span></div>
        </section>

        {activeView === "dashboard" ? (
          <DashboardView api={api} online={online} pendingCount={pendingCount} lastSync={lastSync} setMessage={setMessage} />
        ) : activeView === "academics" ? (
          <AcademicsAdminView api={api} config={config} setMessage={setMessage} />
        ) : activeView === "timetable" ? (
          <TimetableAdminView api={api} config={config} setMessage={setMessage} />
        ) : activeView === "finance" ? (
          <FinanceView api={api} config={config} students={visibleStudents} session={session} online={online} refreshOfflineState={refreshOfflineState} setMessage={setMessage} />
        ) : activeView === "budgets" ? (
          <BudgetsView api={api} config={config} session={session} online={online} refreshOfflineState={refreshOfflineState} setMessage={setMessage} />
        ) : activeView === "inventory" ? (
          <InventoryAdminView api={api} setMessage={setMessage} />
        ) : activeView === "payroll" ? (
          <PayrollAdminView api={api} setMessage={setMessage} />
        ) : activeView === "notifications" ? (
          <NotificationsAdminView api={api} setMessage={setMessage} />
        ) : activeView === "approvals" ? (
          <ApprovalsView api={api} setMessage={setMessage} />
        ) : activeView === "risk" ? (
          <RiskAlertsView api={api} setMessage={setMessage} />
        ) : activeView === "school" ? (
          <SchoolConfigView config={config} api={api} refreshAll={refreshAll} setMessage={setMessage} />
        ) : activeView === "attendance" ? (
          <AttendanceView api={api} setMessage={setMessage} />
        ) : activeView === "sync" ? (
          <SyncReviewView api={api} setMessage={setMessage} />
        ) : activeView === "audit" ? (
          <AuditView api={api} />
        ) : <>
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

            <table>
              <thead><tr><th>Admission</th><th>Name</th><th>Class</th><th>Status</th><th>Sync</th></tr></thead>
              <tbody>
                {visibleStudents.map((student) => (
                  <tr key={student.id} onClick={() => { setSelected(student); setForm(fromStudent(student, config)); }}>
                    <td>{student.admissionNo}</td>
                    <td>{student.firstName} {student.lastName}</td>
                    <td>{student.currentClass?.name ?? config?.classes.find((item) => item.id === student.currentClassId)?.name ?? "-"}</td>
                    <td><span className="pill">{student.status}</span></td>
                    <td>{student.syncStatus ?? "SYNCED"}</td>
                  </tr>
                ))}
                {visibleStudents.length === 0 && <tr><td colSpan={5} className="empty">No students match the current filters.</td></tr>}
              </tbody>
            </table>
          </section>

          <section className="detail-pane">
            {selected ? (
              <StudentProfile student={selected} onReset={() => resetPortal(selected)} />
            ) : (
              <div className="empty-state"><h3>No student selected</h3><p>Select a student to view profile, guardian details, portal account and promotion history.</p></div>
            )}
          </section>
        </section>

        <section className="form-band">
          <div className="section-heading">
            <h3>{selected ? "Edit Student" : "Register Student"}</h3>
            {selected && <button className="ghost" onClick={() => { setSelected(null); setForm(emptyForm); }}>New registration</button>}
          </div>
          <StudentForm form={form} setForm={setForm} config={config} onSubmit={submitStudent} />
        </section>
        </>}
      </section>
    </main>
  );
}

function LoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("admin@aethina.test");
  const [password, setPassword] = useState("AdminPass123");
  const [error, setError] = useState("");
  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={async (event) => { event.preventDefault(); setError(""); try { await onLogin(email, password); } catch { setError("Check your email and password."); } }}>
        <p className="eyebrow">Satelite Secondary</p>
        <h1>Sign in</h1>
        <p className="login-copy">Admin, bursar, teacher, attendance kiosk, finance, academics, inventory, payroll, approvals, and offline sync.</p>
        <div className="demo-strip">Demo admin: admin@aethina.test / AdminPass123</div>
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Login</button>
      </form>
    </main>
  );
}

function RoleHomeCard({ persona, sections, setActiveView }: { persona: Persona; sections: AppSection[]; setActiveView: (view: ActiveView) => void }) {
  return (
    <section className="role-home">
      <div>
        <p className="eyebrow">{persona.kicker}</p>
        <h3>{persona.title}</h3>
        <p>{persona.summary}</p>
      </div>
      <div className="role-actions">
        {sections.slice(0, 5).map((section) => <button key={section.id} type="button" className="ghost" onClick={() => setActiveView(section.id)}>{section.label}</button>)}
      </div>
    </section>
  );
}

function StudentProfile({ student, onReset }: { student: Student; onReset: () => void }) {
  const guardian = student.guardians?.[0];
  return (
    <div className="profile">
      <div className="avatar">{student.firstName.slice(0, 1)}{student.lastName.slice(0, 1)}</div>
      <h3>{student.firstName} {student.middleName} {student.lastName}</h3>
      <p>{student.admissionNo}</p>
      <dl>
        <dt>Guardian</dt><dd>{guardian?.guardian.fullName ?? "-"}</dd>
        <dt>Relationship</dt><dd>{guardian?.relationship ?? "-"}</dd>
        <dt>Phone</dt><dd>{guardian?.guardian.phone ?? "-"}</dd>
        <dt>Email</dt><dd>{guardian?.guardian.email ?? "-"}</dd>
        <dt>Emergency</dt><dd>{student.emergencyContact ?? "-"}</dd>
        <dt>Medical</dt><dd>{student.medicalNotes ?? "None"}</dd>
        <dt>Portal</dt><dd>{student.portalCredential?.username ?? "Pending"}</dd>
      </dl>
      <button onClick={onReset}>Reset Portal Credentials</button>
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
      <label>Admission No.<input value={form.admissionNo} onChange={(event) => update("admissionNo", event.target.value)} placeholder="Auto if blank" /></label>
      <label>First name<input required value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label>
      <label>Middle name<input value={form.middleName} onChange={(event) => update("middleName", event.target.value)} /></label>
      <label>Last name<input required value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label>
      <label>Gender<select value={form.gender} onChange={(event) => update("gender", event.target.value)}><option>FEMALE</option><option>MALE</option><option>OTHER</option></select></label>
      <label>Date of birth<input type="date" value={form.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label>
      <label>Academic year<select value={form.currentAcademicYearId} onChange={(event) => update("currentAcademicYearId", event.target.value)}>{config?.academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
      <label>Class<select required value={form.currentClassId} onChange={(event) => update("currentClassId", event.target.value)}>{config?.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Stream<select value={form.currentStreamId} onChange={(event) => update("currentStreamId", event.target.value)}><option value="">None</option>{selectedClass?.streams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Admission date<input type="date" value={form.admissionDate} onChange={(event) => update("admissionDate", event.target.value)} /></label>
      <label>Status<select value={form.status} onChange={(event) => update("status", event.target.value)}><option>ACTIVE</option><option>APPLICANT</option><option>INACTIVE</option><option>GRADUATED</option></select></label>
      <label>Previous school<input value={form.previousSchool} onChange={(event) => update("previousSchool", event.target.value)} /></label>
      <label>Guardian name<input required value={form.guardianFullName} onChange={(event) => update("guardianFullName", event.target.value)} /></label>
      <label>Relationship<input required value={form.guardianRelationship} onChange={(event) => update("guardianRelationship", event.target.value)} /></label>
      <label>Guardian phone<input required value={form.guardianPhone} onChange={(event) => update("guardianPhone", event.target.value)} /></label>
      <label>Guardian email<input type="email" value={form.guardianEmail} onChange={(event) => update("guardianEmail", event.target.value)} /></label>
      <label>Guardian address<input value={form.guardianAddress} onChange={(event) => update("guardianAddress", event.target.value)} /></label>
      <label>Emergency contact<input required value={form.emergencyContact} onChange={(event) => update("emergencyContact", event.target.value)} /></label>
      <label>Photo URL<input value={form.photoUrl} onChange={(event) => update("photoUrl", event.target.value)} /></label>
      <label>Document URLs<input value={form.supportingDocuments} onChange={(event) => update("supportingDocuments", event.target.value)} placeholder="Comma-separated URLs" /></label>
      <label className="wide">Medical notes<textarea value={form.medicalNotes} onChange={(event) => update("medicalNotes", event.target.value)} /></label>
      <label className="wide">Notes<textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
      <button type="submit">Save Student</button>
    </form>
  );
}

function SchoolConfigView({ config, api, refreshAll, setMessage }: { config: SchoolConfig | null; api: (path: string, init?: RequestInit) => Promise<any>; refreshAll: () => Promise<void>; setMessage: (message: string) => void }) {
  const [profile, setProfile] = useState({ name: "", code: "", phone: "", email: "", address: "", admissionNumberPrefix: "AET" });
  const [academicYear, setAcademicYear] = useState({ name: "", startsAt: "2026-01-01", endsAt: "2026-12-31", isActive: true });
  const [term, setTerm] = useState({ academicYearId: "", name: "Term 1", startsAt: "2026-01-01", endsAt: "2026-04-30", isCurrent: true });
  const [classForm, setClassForm] = useState({ name: "", level: "1" });
  const [stream, setStream] = useState({ classId: "", name: "" });
  const [subject, setSubject] = useState({ code: "", name: "" });
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
  }, [config]);

  async function submit(path: string, body: Record<string, unknown>, success: string) {
    try {
      await api(path, { method: path === "/school-config/profile" ? "PUT" : "POST", body: JSON.stringify(withIsoDates(body)) });
      setMessage(success);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Configuration update failed.");
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
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load attendance."));
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
        <table>
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
        </table>
      </section>
    </section>
  );
}

function AttendanceTable({ records }: { records: AttendanceRecord[] }) {
  return (
    <table>
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
    </table>
  );
}

function SyncReviewView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);

  async function load() {
    setConflicts(asArray<SyncConflictRecord>(await api("/sync/conflicts")));
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load sync conflicts."));
  }, []);

  async function decide(id: string, action: "resolve" | "reject") {
    await api(`/sync/conflicts/${id}/${action}`, { method: "POST", body: "{}" });
    setMessage(`Sync conflict ${action === "resolve" ? "resolved" : "rejected"}.`);
    await load();
  }

  return (
    <section className="operation-panel">
      <div className="section-heading"><h3>Synchronization Conflicts</h3><button type="button" onClick={() => void load()}>Refresh</button></div>
      <table>
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
      </table>
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
      <table>
        <thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Actor</th></tr></thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{new Date(record.createdAt).toLocaleString()}</td>
              <td>{record.action}</td>
              <td>{record.entityType}<br /><small>{record.entityId}</small></td>
              <td>{record.actorId ?? "-"}</td>
            </tr>
          ))}
          {records.length === 0 && <tr><td colSpan={4} className="empty">No audit events match the current filters.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function ConfigList({ items }: { items: string[] }) {
  return (
    <ul className="config-list">
      {items.slice(0, 8).map((item) => <li key={item}>{item}</li>)}
      {items.length === 0 && <li>No records yet.</li>}
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

function DashboardView({ api, online, pendingCount, lastSync, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; online: boolean; pendingCount: number; lastSync: string; setMessage: (message: string) => void }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<Array<{ type: string; title: string; severity?: string; createdAt: string }>>([]);
  const [activity, setActivity] = useState<AuditRecord[]>([]);

  async function load() {
    const [nextSummary, nextAlerts, nextActivity] = await Promise.all([
      api("/dashboard/summary"),
      api("/dashboard/alerts"),
      api("/dashboard/activity")
    ]);
    setSummary(nextSummary);
    setAlerts(nextAlerts);
    setActivity(nextActivity);
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Dashboard unavailable."));
  }, []);

  const cards = [
    ["Active students", summary?.activeStudents],
    ["Teachers", summary?.teachers],
    ["Expected fees", ugx(summary?.expectedFees)],
    ["Fees collected", ugx(summary?.collectedFees)],
    ["Outstanding fees", ugx(summary?.outstandingFees)],
    ["Collection rate", summary?.collectionPercentage === null || summary?.collectionPercentage === undefined ? "-" : `${summary.collectionPercentage}%`],
    ["Teacher attendance today", summary?.attendanceToday],
    ["Budget approvals", summary?.pendingBudgetApprovals],
    ["Expense approvals", summary?.pendingExpenseApprovals],
    ["Sync conflicts", summary?.unresolvedSyncConflicts],
    ["Risk alerts", summary?.suspiciousFinancialActivities],
    ["Low stock", summary?.lowStockItems],
    ["Marks awaiting approval", summary?.marksAwaitingApproval],
    ["Published report cards", summary?.publishedReportCards],
    ["Active payroll runs", summary?.activePayrollRuns],
    ["Failed notifications", summary?.failedNotifications],
    ["Portal logins today", summary?.portalLoginsToday]
  ];

  return (
    <section className="dashboard-grid">
      {!online && <div className="notice stale">Offline. Figures are from the last synchronized cache where available. Last sync: {lastSync}. Pending local changes: {pendingCount}.</div>}
      <section className="metric-grid wide-panel">
        {cards.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value ?? "-"}</strong></div>)}
      </section>
      <section className="operation-panel">
        <div className="section-heading"><h3>Finance Overview</h3><button type="button" onClick={() => void load()}>Refresh</button></div>
        <dl className="finance-dl">
          <dt>Discounts/Waivers</dt><dd>{ugx(summary?.discountsWaivers)}</dd>
          <dt>Expenses</dt><dd>{ugx(summary?.expenses)}</dd>
          <dt>Net cash movement</dt><dd>{ugx(summary?.netCashMovement)}</dd>
          <dt>As of</dt><dd>{summary ? new Date(summary.asOf).toLocaleString() : "-"}</dd>
        </dl>
      </section>
      <section className="operation-panel">
        <div className="section-heading"><h3>Action Alerts</h3><span className="pill">{alerts.length}</span></div>
        <table><tbody>
          {alerts.map((alert, index) => <tr key={`${alert.type}-${index}`}><td><span className="pill">{alert.type}</span></td><td>{alert.title}</td><td>{alert.severity ?? ""}</td></tr>)}
          {alerts.length === 0 && <tr><td className="empty">No active alerts.</td></tr>}
        </tbody></table>
      </section>
      <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Recent Activity</h3></div>
        <table>
          <thead><tr><th>Time</th><th>Action</th><th>Entity</th></tr></thead>
          <tbody>
            {activity.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.action}</td><td>{item.entityType}</td></tr>)}
            {activity.length === 0 && <tr><td colSpan={3} className="empty">No recent activity yet.</td></tr>}
          </tbody>
        </table>
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
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Finance data unavailable."));
  }, []);

  useEffect(() => {
    if (config) setFeeForm((current) => ({ ...current, classId: current.classId || config.classes[0]?.id || "" }));
  }, [config]);

  async function createFee(event: React.FormEvent) {
    event.preventDefault();
    await api("/finance/fee-structures", {
      method: "POST",
      body: JSON.stringify({
        classId: feeForm.classId,
        academicYearId: config?.school.currentAcademicYearId,
        termId: config?.school.currentTermId,
        category: feeForm.category,
        name: feeForm.name,
        amount: Number(feeForm.amount),
        dueDate: new Date(feeForm.dueDate).toISOString(),
        isMandatory: feeForm.isMandatory,
        isActive: true
      })
    });
    setMessage("Fee structure created.");
    await load();
  }

  async function generateInvoices() {
    await api("/finance/invoices/generate", { method: "POST", body: JSON.stringify({ termId: config?.school.currentTermId, classId: feeForm.classId, dueDate: new Date(feeForm.dueDate).toISOString() }) });
    setMessage("Invoices generated without duplicating existing invoices.");
    await load();
  }

  async function recordPayment(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      invoiceId: paymentForm.invoiceId,
      amount: Number(paymentForm.amount),
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
    const payload = { ...expenseForm, amount: Number(expenseForm.amount), spentAt: new Date(expenseForm.spentAt).toISOString(), budgetId: expenseForm.budgetId || null, requestedBy: session.user.id, createdBy: session.user.id };
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

  return (
    <section className="operations-grid finance-layout">
      <div className="tabs wide-panel">
        {["overview", "fees", "invoices", "payments", "expenses", "reports"].map((item) => <button key={item} className={tab === item ? "active" : "ghost"} type="button" onClick={() => setTab(item as typeof tab)}>{item}</button>)}
      </div>
      {tab === "overview" && <section className="metric-grid wide-panel">
        <div className="metric"><span>Expected</span><strong>{ugx(overview?.expectedFees)}</strong></div>
        <div className="metric"><span>Collected</span><strong>{ugx(overview?.collectedFees)}</strong></div>
        <div className="metric"><span>Outstanding</span><strong>{ugx(overview?.outstandingFees)}</strong></div>
        <div className="metric"><span>Collection</span><strong>{overview?.collectionPercentage ?? 0}%</strong></div>
        <div className="metric"><span>Discounts</span><strong>{ugx(overview?.discounts)}</strong></div>
        <div className="metric"><span>Expenses</span><strong>{ugx(overview?.expenses)}</strong></div>
      </section>}
      {tab === "fees" && <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Fee Structures</h3><button type="button" onClick={generateInvoices}>Generate Invoices</button></div>
        <form className="inline-form" onSubmit={(event) => void createFee(event)}>
          <select value={feeForm.classId} onChange={(event) => setFeeForm({ ...feeForm, classId: event.target.value })}>{config?.classes.map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}</select>
          <input placeholder="Category" value={feeForm.category} onChange={(event) => setFeeForm({ ...feeForm, category: event.target.value })} />
          <input placeholder="Fee name" value={feeForm.name} onChange={(event) => setFeeForm({ ...feeForm, name: event.target.value })} />
          <input type="number" placeholder="Amount" value={feeForm.amount} onChange={(event) => setFeeForm({ ...feeForm, amount: event.target.value })} />
          <input type="date" value={feeForm.dueDate} onChange={(event) => setFeeForm({ ...feeForm, dueDate: event.target.value })} />
          <button type="submit">Add Fee</button>
        </form>
        <FinanceTable rows={fees.map((fee) => [fee.class?.name ?? "-", fee.category, fee.name, ugx(fee.amount), fee.isActive ? "Active" : "Inactive"])} headings={["Class", "Category", "Name", "Amount", "Status"]} />
      </section>}
      {tab === "invoices" && <section className="operation-panel wide-panel"><div className="section-heading"><h3>Student Invoices</h3></div><InvoiceTable invoices={invoices} /></section>}
      {tab === "payments" && <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Record Payment</h3><span className="pill">{localPayments.length} offline pending</span></div>
        <form className="inline-form" onSubmit={(event) => void recordPayment(event)}>
          <select value={paymentForm.invoiceId} onChange={(event) => setPaymentForm({ ...paymentForm, invoiceId: event.target.value })}><option value="">Select invoice</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} - {invoice.student.firstName} {invoice.student.lastName} - {ugx(invoice.balance)}</option>)}</select>
          <input type="number" placeholder="Amount" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} />
          <select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>{["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "BANK_DEPOSIT", "CHEQUE", "ONLINE_PAYMENT", "OTHER"].map((method) => <option key={method}>{method}</option>)}</select>
          <input placeholder="Reference" value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} />
          <input type="date" value={paymentForm.paidAt} onChange={(event) => setPaymentForm({ ...paymentForm, paidAt: event.target.value })} />
          <button type="submit">Record</button>
        </form>
      </section>}
      {tab === "expenses" && <section className="operation-panel wide-panel">
        <div className="section-heading"><h3>Expenses</h3><span className="pill">{localExpenses.length} offline pending</span></div>
        <form className="inline-form" onSubmit={(event) => void recordExpense(event)}>
          <input placeholder="Category" value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} />
          <input placeholder="Department" value={expenseForm.department} onChange={(event) => setExpenseForm({ ...expenseForm, department: event.target.value })} />
          <input placeholder="Description" value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} />
          <input type="number" placeholder="Amount" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} />
          <input placeholder="Payee" value={expenseForm.payee} onChange={(event) => setExpenseForm({ ...expenseForm, payee: event.target.value })} />
          <button type="submit">Record</button>
        </form>
        <FinanceTable rows={expenses.map((expense) => [expense.expenseNo ?? "-", expense.category, expense.department ?? "-", ugx(expense.amount), expense.approvalStatus])} headings={["No.", "Category", "Department", "Amount", "Status"]} />
      </section>}
      {tab === "reports" && <section className="operation-panel wide-panel"><div className="section-heading"><h3>Initial Reports</h3></div><FinanceTable rows={invoices.map((invoice) => [invoice.student.admissionNo, `${invoice.student.firstName} ${invoice.student.lastName}`, ugx(invoice.amount), ugx(invoice.amountPaid), ugx(invoice.balance)])} headings={["Admission", "Student", "Expected", "Paid", "Balance"]} /></section>}
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
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Budgets unavailable.")); }, []);
  async function createBudget(event: React.FormEvent) {
    event.preventDefault();
    await api("/finance/budgets", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount), warningThreshold: Number(form.warningThreshold), year: Number(form.year), academicYearId: config?.school.currentAcademicYearId, termId: config?.school.currentTermId }) });
    setMessage("Budget created.");
    await load();
  }
  async function submitRequest(event: React.FormEvent) {
    event.preventDefault();
    const payload = { budgetId: request.budgetId, amount: Number(request.amount), reason: request.reason, requestedBy: session.user.id };
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
        <div className="section-heading"><h3>Create Budget</h3><button type="submit">Save</button></div>
        <input placeholder="Budget name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input placeholder="Department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
        <input placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
        <input type="number" placeholder="Amount" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
      </form>
      <form className="operation-panel panel-form" onSubmit={(event) => void submitRequest(event)}>
        <div className="section-heading"><h3>Budget Request</h3><button type="submit">Submit</button></div>
        <select value={request.budgetId} onChange={(event) => setRequest({ ...request, budgetId: event.target.value })}>{budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.name}</option>)}</select>
        <input type="number" placeholder="Amount" value={request.amount} onChange={(event) => setRequest({ ...request, amount: event.target.value })} />
        <textarea placeholder="Reason" value={request.reason} onChange={(event) => setRequest({ ...request, reason: event.target.value })} />
      </form>
    </section>
  );
}

function ApprovalsView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [rows, setRows] = useState<ApprovalRecord[]>([]);
  async function load() { setRows(asArray<ApprovalRecord>(await api("/approvals"))); }
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Approvals unavailable.")); }, []);
  async function decide(id: string, decision: string) {
    await api(`/approvals/${id}/decision`, { method: "POST", body: JSON.stringify({ decision, comment: `Desktop ${decision.toLowerCase()} decision` }) });
    setMessage(`Approval ${decision.toLowerCase().replaceAll("_", " ")}.`);
    await load();
  }
  return <section className="operation-panel"><div className="section-heading"><h3>Approval Inbox</h3><button type="button" onClick={() => void load()}>Refresh</button></div><table><thead><tr><th>Type</th><th>Submitted</th><th>Level</th><th>Status</th><th>Decision</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.entityType}<br /><small>{row.entityId}</small></td><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.approvalLevel}</td><td><span className="pill">{row.status}</span></td><td className="row-actions"><button type="button" onClick={() => void decide(row.id, "APPROVED")}>Approve</button><button className="ghost" type="button" onClick={() => void decide(row.id, "REJECTED")}>Reject</button><button className="ghost" type="button" onClick={() => void decide(row.id, "RETURNED_FOR_CORRECTION")}>Return</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={5} className="empty">No approval items waiting.</td></tr>}</tbody></table></section>;
}

function RiskAlertsView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [rows, setRows] = useState<RiskAlertRecord[]>([]);
  async function load() { setRows(asArray<RiskAlertRecord>(await api("/risk-alerts"))); }
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Risk alerts unavailable.")); }, []);
  async function review(id: string, status: string) {
    await api(`/risk-alerts/${id}/review`, { method: "POST", body: JSON.stringify({ status, notes: `Reviewed in desktop as ${status}` }) });
    setMessage(`Risk alert marked ${status.toLowerCase().replaceAll("_", " ")}.`);
    await load();
  }
  return <section className="operation-panel"><div className="section-heading"><h3>Financial Risk Alert Center</h3><button type="button" onClick={() => void load()}>Refresh</button></div><table><thead><tr><th>Risk</th><th>Entity</th><th>Amount</th><th>Reason</th><th>Status</th><th>Review</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.category}<br /><span className="pill">{row.severity}</span></td><td>{row.entityType}<br /><small>{row.entityId}</small></td><td>{ugx(row.amount)}</td><td>{row.reason}</td><td>{row.status}</td><td className="row-actions"><button type="button" onClick={() => void review(row.id, "UNDER_REVIEW")}>Review</button><button className="ghost" type="button" onClick={() => void review(row.id, "RESOLVED")}>Resolve</button><button className="ghost" type="button" onClick={() => void review(row.id, "FALSE_POSITIVE")}>False Positive</button><button className="ghost" type="button" onClick={() => void review(row.id, "ESCALATED")}>Escalate</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={6} className="empty">No financial risk alerts found.</td></tr>}</tbody></table></section>;
}

function AcademicsAdminView({ api, config, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; config: SchoolConfig | null; setMessage: (message: string) => void }) {
  const [exams, setExams] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  async function load() {
    const [nextExams, nextAssessments, nextCards] = await Promise.all([api("/academics/examinations"), api("/academics/assessments"), api("/academics/report-cards")]);
    setExams(asArray<any>(nextExams));
    setAssessments(asArray<any>(nextAssessments));
    setCards(asArray<any>(nextCards));
  }
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Academics unavailable.")); }, []);
  const termName = config?.academicYears.flatMap((year) => year.terms).find((term) => term.id === config.school.currentTermId)?.name ?? "-";
  return <section className="operation-panel wide-panel"><div className="section-heading"><h3>Academic Management</h3><button type="button" onClick={() => void load()}>Refresh</button></div><div className="summary-strip"><span>Current term: {termName}</span><span>{assessments.filter((item) => item.status === "SUBMITTED").length} awaiting review</span><span>{cards.filter((item) => item.status === "PUBLISHED").length} published report cards</span></div><FinanceTable headings={["Exam", "Type", "Status", "Window"]} rows={exams.map((exam) => [exam.name, exam.examinationType ?? "-", exam.status ?? "-", `${dateOnly(exam.startsAt)} - ${dateOnly(exam.endsAt)}`])} /><FinanceTable headings={["Assessment", "Subject", "Status", "Marks"]} rows={assessments.map((item) => [item.name, item.subject?.name ?? "-", item.status ?? "-", item.marks?.length ?? 0])} /><FinanceTable headings={["Student", "Grade", "Average", "Status"]} rows={cards.slice(0, 20).map((card) => [`${card.student?.firstName ?? ""} ${card.student?.lastName ?? ""}`, card.grade, String(card.averageScore), card.status])} /></section>;
}

function TimetableAdminView({ api, config, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; config: SchoolConfig | null; setMessage: (message: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  async function load() { setRows(asArray<any>(await api("/timetable"))); }
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Timetable unavailable.")); }, []);
  const subjects = new Map((config?.subjects ?? []).map((subject) => [subject.id, subject.name]));
  return <section className="operation-panel wide-panel"><div className="section-heading"><h3>Timetable</h3><button type="button" onClick={() => void load()}>Refresh</button></div><FinanceTable headings={["Day", "Period", "Subject", "Time", "Room"]} rows={rows.map((row) => [`Day ${row.dayOfWeek}`, row.periodNumber, subjects.get(row.subjectId) ?? row.subjectId, `${row.startsAt}-${row.endsAt}`, row.room ?? "-"])} /></section>;
}

function InventoryAdminView({ api, setMessage }: { api: (path: string, init?: RequestInit) => Promise<any>; setMessage: (message: string) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  async function load() {
    const [nextItems, nextMovements] = await Promise.all([api("/inventory/items"), api("/inventory/movements")]);
    setItems(asArray<any>(nextItems));
    setMovements(asArray<any>(nextMovements));
  }
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Inventory unavailable.")); }, []);
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
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Payroll unavailable.")); }, []);
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
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Notifications unavailable.")); }, []);
  return <section className="operation-panel wide-panel"><div className="section-heading"><h3>Notifications & Announcements</h3><button type="button" onClick={() => void load()}>Refresh</button></div><FinanceTable headings={["Title", "Recipient", "Channel", "Status"]} rows={notifications.slice(0, 30).map((row) => [row.title, `${row.recipientType}${row.recipientId ? `:${row.recipientId}` : ""}`, row.channel, row.status])} /><FinanceTable headings={["Announcement", "Audience", "Priority", "Published"]} rows={announcements.map((row) => [row.title, row.audience, row.priority, dateOnly(row.publishAt)])} /></section>;
}

function InvoiceTable({ invoices }: { invoices: InvoiceRecord[] }) {
  return <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Student</th><th>Expected</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.invoiceNo}</td><td>{invoice.student.admissionNo}<br /><small>{invoice.student.firstName} {invoice.student.lastName}</small></td><td>{ugx(invoice.amount)}</td><td>{ugx(invoice.amountPaid)}</td><td>{ugx(invoice.balance)}</td><td><span className="pill">{invoice.status}</span></td></tr>)}{invoices.length === 0 && <tr><td colSpan={6} className="empty">No invoices yet.</td></tr>}</tbody></table></div>;
}

function FinanceTable({ headings, rows }: { headings: string[]; rows: Array<Array<string | number>> }) {
  return <div className="table-scroll"><table><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan={headings.length} className="empty">No records to display.</td></tr>}</tbody></table></div>;
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

function personaFor(roles: string[], permissions: string[]): Persona {
  const roleText = roles.join(" ").toLowerCase();
  const permissionSet = new Set(permissions);
  if (roleText.includes("administrator")) {
    return {
      kicker: "Full command center",
      title: "School Administrator Console",
      summary: "Complete oversight of learners, academics, finance, operations, approvals, risk, sync, and audit."
    };
  }
  if (roleText.includes("head teacher")) {
    return {
      kicker: "Academic leadership",
      title: "Head Teacher Workspace",
      summary: "Academic supervision, student progress, timetable coordination, approvals, and school communication."
    };
  }
  if (roleText.includes("bursar") || roleText.includes("accountant") || permissionSet.has(PermissionKey.FinanceManage)) {
    return {
      kicker: "Finance office",
      title: "Bursar & Accounts Workspace",
      summary: "Fees, invoices, payments, expenses, budgets, payroll records, and finance reporting."
    };
  }
  if (roleText.includes("teacher") || permissionSet.has(PermissionKey.MarksEntry)) {
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

function viewTitle(view: ActiveView) {
  return {
    dashboard: "Administrative Dashboard",
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

function ugx(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "-";
  return `UGX ${Math.round(Number(value)).toLocaleString("en-UG")}`;
}

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";
}

function dateOnly(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
