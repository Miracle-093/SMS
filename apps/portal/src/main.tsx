import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiBaseUrl } from "./config.js";
import { AlertMessage, EmptyState, LoadFailed, LoadingState, type PortalIssue } from "./ui.js";
import "./styles.css";

type Session = {
  accessToken: string;
  user: { id: string; schoolId: string; displayName: string; email: string; mustChangePassword: boolean };
};

type PortalHome = {
  student: { admissionNo: string; firstName: string; lastName: string; currentClass?: { name: string }; currentStream?: { name: string } };
  finance: { expected: number; paid: number; balance: number };
  latestReport?: { grade: string; averageScore: string | number; status: string } | null;
  announcements: Array<{ id: string; title: string; message: string; priority: string; publishAt: string }>;
  notifications: Array<{ id: string; title: string; body: string; readAt?: string | null; createdAt: string }>;
  timetable: Array<{ id: string; dayOfWeek: number; periodNumber: number; startsAt: string; endsAt: string; subjectId: string; room?: string | null }>;
};

const primaryViews = ["home", "academics", "finance", "timetable", "more"] as const;
const loadableViews = ["home", "academics", "finance", "timetable", "announcements", "notifications"] as const;

type LoadableView = (typeof loadableViews)[number];
type StudentIdentity = PortalHome["student"];
type TableColumn<T> = { heading: string; render: (row: T) => React.ReactNode; align?: "right" };
const demoMode = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === "true";
const demoUsername = "sat-s1-001";
const demoPassword = "StudentPass123";

function PortalApp() {
  const [session, setSession] = useState<Session | null>(() => readJson("aethina.portal.session", null));
  const [username, setUsername] = useState(demoMode ? demoUsername : "");
  const [password, setPassword] = useState(demoMode ? demoPassword : "");
  const [active, setActive] = useState("home");
  const [home, setHome] = useState<PortalHome | null>(null);
  const [academics, setAcademics] = useState<any>(null);
  const [finance, setFinance] = useState<any>(null);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [error, setError] = useState<PortalIssue | null>(null);
  const [viewErrors, setViewErrors] = useState<Partial<Record<LoadableView, PortalIssue | null>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void refresh(session.accessToken, active);
  }, [session, active]);

  const unread = useMemo(() => notifications.filter((item) => !item.readAt).length, [notifications]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const nextSession = await api<Session>("/auth/portal-login", null, { method: "POST", body: { username, password } });
      localStorage.setItem("aethina.portal.session", JSON.stringify(nextSession));
      setSession(nextSession);
      setActive("home");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }

  async function refresh(token: string, view: string) {
    setLoading(true);
    setError(null);
    try {
      const loadableView = loadableViews.includes(view as LoadableView) ? view as LoadableView : null;
      if (loadableView) setViewErrors((current) => ({ ...current, [loadableView]: null }));
      if (view === "home") {
        setHome(await api<PortalHome>("/portal/home", token));
        setNotifications(await api<any[]>("/portal/notifications", token));
      }
      if (view === "academics") setAcademics(await api("/portal/academics", token));
      if (view === "finance") setFinance(await api("/portal/finance", token));
      if (view === "timetable") setTimetable(await api<any[]>("/portal/timetable", token));
      if (view === "announcements") setAnnouncements(await api<any[]>("/portal/announcements", token));
      if (view === "notifications") setNotifications(await api<any[]>("/portal/notifications", token));
    } catch (err) {
      const issue = readableError(err);
      setError(issue);
      const loadableView = loadableViews.includes(view as LoadableView) ? view as LoadableView : null;
      if (loadableView) setViewErrors((current) => ({ ...current, [loadableView]: issue }));
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("aethina.portal.session");
    setSession(null);
    setHome(null);
    setViewErrors({});
  }

  async function markNotificationRead(id: string) {
    if (!session) return;
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item));
    setHome((current) => current ? {
      ...current,
      notifications: current.notifications.map((item) => item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item)
    } : current);
    try {
      await api(`/portal/notifications/${id}/read`, session.accessToken, { method: "POST" });
    } catch (err) {
      const issue = readableError(err);
      setViewErrors((current) => ({ ...current, notifications: issue }));
      void refresh(session.accessToken, "notifications");
    }
  }

  if (!session) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={login}>
          <p className="eyebrow">Satelite Secondary</p>
          <h1>Student Portal</h1>
          <p className="slogan">Student Portal workspace for families and learners.</p>
          {demoMode && <div className="demo-strip">Demo mode: credentials are filled in for local testing.</div>}
          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          <AlertMessage issue={error} title="Sign-in issue" />
          <button type="submit" disabled={loading} aria-busy={loading}>{loading ? "Signing in..." : "Sign in"}</button>
        </form>
      </main>
    );
  }

  const studentIdentity = home?.student;
  const studentDisplayName = studentIdentity ? `${studentIdentity.firstName} ${studentIdentity.lastName}` : session.user.displayName;
  const workspaceIdentity = "Student Portal";
  const activeLoadableView = loadableViews.includes(active as LoadableView) ? active as LoadableView : null;
  const activeError = activeLoadableView ? viewErrors[activeLoadableView] : null;
  const activeHasData =
    active === "home" ? Boolean(home) :
    active === "academics" ? Boolean(academics) :
    active === "finance" ? Boolean(finance) :
    active === "timetable" ? Boolean(timetable.length || home?.timetable?.length) :
    active === "announcements" ? Boolean(announcements.length || home?.announcements?.length) :
    active === "notifications" ? Boolean(notifications.length || home?.notifications?.length) :
    true;

  return (
    <main className="portal">
      <header className="mobile-top clean-mobile-top">
        <div>
          <strong>Satelite Secondary</strong>
          <span>{studentDisplayName} - {workspaceIdentity}</span>
        </div>
        <button className="text-button" type="button" onClick={logout}>Logout</button>
      </header>
      <aside>
        <div className="school-mark" aria-hidden="true">SS</div>
        <h1>Satelite</h1>
        <p>Secondary School</p>
        <div className="identity-card">
          <span>{workspaceIdentity}</span>
          <strong>{studentDisplayName}</strong>
          {studentIdentity && <small>{studentIdentity.admissionNo}</small>}
        </div>
        <nav aria-label="Student portal navigation">
        {["home", "academics", "finance", "timetable", "announcements", "notifications"].map((view) => (
          <button key={view} type="button" className={active === view ? "active" : ""} aria-current={active === view ? "page" : undefined} onClick={() => setActive(view)}>
            {view === "notifications" && unread ? `Notifications (${unread})` : title(view)}
          </button>
        ))}
        </nav>
        <button type="button" onClick={logout}>Sign out</button>
      </aside>
      <section className="content" aria-busy={loading}>
        <header className="workspace-bar">
          <div>
            <p className="eyebrow">{workspaceIdentity}</p>
            <h2>{studentDisplayName}</h2>
          </div>
          <span>Satelite Secondary School</span>
        </header>
        {loading && activeHasData && <div className="loading-ribbon" role="status">Refreshing latest portal information...</div>}
        {activeError && activeHasData && <AlertMessage issue={activeError} title={`${title(active)} issue`} />}
        {active === "home" && (viewErrors.home && !loading && !home ? <LoadFailed title="Dashboard unavailable" issue={viewErrors.home} onRetry={() => void refresh(session.accessToken, "home")} /> : <HomeView home={home} />)}
        {active === "academics" && (viewErrors.academics && !loading && !academics ? <LoadFailed title="Academics unavailable" issue={viewErrors.academics} onRetry={() => void refresh(session.accessToken, "academics")} /> : <AcademicsView data={academics} student={studentIdentity} />)}
        {active === "finance" && (viewErrors.finance && !loading && !finance ? <LoadFailed title="Finance unavailable" issue={viewErrors.finance} onRetry={() => void refresh(session.accessToken, "finance")} /> : <FinanceView data={finance} student={studentIdentity} />)}
        {active === "timetable" && (viewErrors.timetable && !loading ? <LoadFailed title="Timetable unavailable" issue={viewErrors.timetable} onRetry={() => void refresh(session.accessToken, "timetable")} /> : <TimetableView rows={timetable.length ? timetable : home?.timetable ?? []} />)}
        {active === "announcements" && (viewErrors.announcements && !loading ? <LoadFailed title="Announcements unavailable" issue={viewErrors.announcements} onRetry={() => void refresh(session.accessToken, "announcements")} /> : <FeedView title="Announcements" rows={announcements.length ? announcements : home?.announcements ?? []} kind="announcements" />)}
        {active === "notifications" && (viewErrors.notifications && !loading ? <LoadFailed title="Notifications unavailable" issue={viewErrors.notifications} onRetry={() => void refresh(session.accessToken, "notifications")} /> : <FeedView title="Notifications" rows={notifications.length ? notifications : home?.notifications ?? []} kind="notifications" onMarkRead={(id) => void markNotificationRead(id)} />)}
        {active === "more" && <MoreView setActive={setActive} logout={logout} unread={unread} />}
      </section>
      <nav className="bottom-nav" aria-label="Primary portal navigation">
        {primaryViews.map((view) => (
          <button key={view} type="button" className={active === view ? "active" : ""} aria-current={active === view ? "page" : undefined} onClick={() => setActive(view)}>
            {view === "more" && unread ? `More (${unread})` : title(view)}
          </button>
        ))}
      </nav>
    </main>
  );
}

function HomeView({ home }: { home: PortalHome | null }) {
  if (!home) return <LoadingState title="Loading portal dashboard" />;
  const firstTimetable = home.timetable[0];
  const latestStatus = home.latestReport?.status ? titleCase(String(home.latestReport.status)) : "Not published";
  return (
    <>
      <header className="home-hero">
        <div>
          <p className="eyebrow">{home.student.admissionNo}</p>
          <h2>{home.student.firstName} {home.student.lastName}</h2>
          <p>{[home.student.currentClass?.name, home.student.currentStream?.name].filter(Boolean).join(" ") || "Class details not assigned"}</p>
        </div>
        <div className={home.finance.balance > 0 ? "hero-panel owing" : "hero-panel settled"}>
          <span>Fee balance</span>
          <strong>{ugx(home.finance.balance)}</strong>
          <small>{home.finance.balance > 0 ? `${ugx(home.finance.paid)} paid so far` : "Fees currently settled"}</small>
        </div>
      </header>
      <section className="stats">
        <Metric label="Fee balance" value={ugx(home.finance.balance)} danger={home.finance.balance > 0} />
        <Metric label="Paid this term" value={ugx(home.finance.paid)} />
        <Metric label="Latest result" value={home.latestReport ? `${home.latestReport.grade} - ${home.latestReport.averageScore}` : "Pending"} />
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <p className="eyebrow">Latest report</p>
          <h3>{home.latestReport ? `Grade ${home.latestReport.grade}` : "No report published yet"}</h3>
          <dl className="detail-list">
            <div><dt>Average</dt><dd>{home.latestReport?.averageScore ?? "N/A"}</dd></div>
            <div><dt>Status</dt><dd>{latestStatus}</dd></div>
          </dl>
        </article>
        <article className="panel">
          <p className="eyebrow">Upcoming timetable</p>
          <h3>{firstTimetable ? `Day ${firstTimetable.dayOfWeek}, Period ${firstTimetable.periodNumber}` : "No timetable published"}</h3>
          <p>{firstTimetable ? `${timeRange(firstTimetable)}${firstTimetable.room ? ` in ${firstTimetable.room}` : ""}` : "The school has not published timetable entries for this class yet."}</p>
        </article>
      </section>
      <section className="split">
        <FeedView title="Announcements" rows={home.announcements.slice(0, 3)} kind="announcements" compact />
        <FeedView title="Notifications" rows={home.notifications.slice(0, 3)} kind="notifications" compact />
      </section>
    </>
  );
}

function AcademicsView({ data, student }: { data: any; student?: StudentIdentity }) {
  const marks = data?.marks ?? [];
  const cards = data?.reportCards ?? [];
  const marksByAssessment = groupBy(marks, (mark: any) => mark.assessment?.examination?.name ?? mark.assessment?.name ?? "Published marks");
  if (!data) return <LoadingState title="Loading academics" />;
  return (
    <>
      <SectionTitle eyebrow="Uganda grading" title="Academics" helper="Published marks and report cards use D1-F9 grade boundaries." action={<button type="button" className="ghost no-print" onClick={printPage}>Print</button>} />
      <PrintHeader title="Academic Results / Report Card" student={student} />
      <section className="panel grading-panel">
        <h3>Grading guide</h3>
        <p>Uganda grades run from D1 as the strongest performance through F9. A higher score usually maps to a lower grade number.</p>
        <div className="grade-scale" aria-label="Uganda grading scale">
          {["D1", "D2", "C3", "C4", "C5", "C6", "P7", "P8", "F9"].map((grade) => <span key={grade}>{grade}</span>)}
        </div>
      </section>
      <section className="stack">
        <SectionTitle eyebrow="Marks" title="Published marks" helper="Grouped by assessment so each result is easier to scan." />
        {marks.length === 0 ? <EmptyState title="No published marks yet" helper="Marks will appear here after teachers publish them to the portal." /> : Object.entries(marksByAssessment).map(([assessment, rows]) => (
          <article className="panel" key={assessment}>
            <h3>{assessment}</h3>
            <DataTable
              caption={assessment}
              columns={[
                { heading: "Subject", render: (mark: any) => mark.subject?.name ?? "Subject" },
                { heading: "Score", align: "right", render: (mark: any) => mark.score },
                { heading: "Grade", render: (mark: any) => mark.grade ?? "N/A" }
              ]}
              empty="No published marks yet."
              rows={rows as any[]}
            />
          </article>
        ))}
      </section>
      <section className="stack">
        <SectionTitle eyebrow="Reports" title="Report cards" helper="Official published summaries for printing or review." />
        {cards.length === 0 ? <EmptyState title="No report cards published yet" helper="Published report cards will appear here when the school releases them." /> : (
          <div className="card-grid">
            {cards.map((card: any) => (
              <article className="result-card" key={card.id}>
                <span>{dateLabel(card.generatedAt)}</span>
                <strong>Grade {card.grade ?? "N/A"}</strong>
                <p>Average {Number(card.averageScore ?? 0).toFixed(0)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function FinanceView({ data, student }: { data: any; student?: StudentIdentity }) {
  if (!data) return <LoadingState title="Loading finance" />;
  const summary = data.summary ?? { expected: 0, paid: 0, balance: 0 };
  const invoices = data.invoices ?? [];
  const payments = invoices.flatMap((invoice: any) => (invoice.payments ?? []).map((payment: any) => ({ ...payment, invoiceNo: invoice.invoiceNo })));
  return (
    <>
      <SectionTitle eyebrow="Term billing" title="Finance" helper="Track issued invoices, payments received, and outstanding balances." action={<button type="button" className="ghost no-print" onClick={printPage}>Print</button>} />
      <PrintHeader title="Student Invoice / Fee Statement" student={student} />
      <section className="stats">
        <Metric label="Expected" value={ugx(summary.expected)} />
        <Metric label="Paid" value={ugx(summary.paid)} />
        <Metric label="Balance" value={ugx(summary.balance)} danger={summary.balance > 0} />
      </section>
      <section className="finance-overview">
        <article className="panel">
          <p className="eyebrow">Statement summary</p>
          <h3>{summary.balance > 0 ? "Outstanding balance" : "No outstanding balance"}</h3>
          <p>{summary.balance > 0 ? `${ugx(summary.balance)} remains after ${ugx(summary.paid)} in payments.` : `${ugx(summary.paid)} has been recorded against issued invoices.`}</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Payment history</p>
          <h3>{payments.length ? `${payments.length} recorded payment${payments.length === 1 ? "" : "s"}` : "No payments recorded"}</h3>
          <p>{payments[0] ? `Latest receipt ${payments[0].receiptNo ?? payments[0].receipt?.receiptNo ?? "N/A"} for ${ugx(payments[0].amount)}.` : "Payments will appear here after the bursar posts them."}</p>
        </article>
      </section>
      <DataTable
        caption="Fee statement"
        columns={[
          { heading: "Invoice", render: (invoice: any) => invoice.invoiceNo },
          { heading: "Issued", render: (invoice: any) => dateLabel(invoice.invoiceDate) },
          { heading: "Status", render: (invoice: any) => title(String(invoice.status ?? "pending").toLowerCase()) },
          { heading: "Expected", align: "right", render: (invoice: any) => ugx(invoice.amount) },
          { heading: "Paid", align: "right", render: (invoice: any) => ugx(invoice.amountPaid) },
          { heading: "Balance", align: "right", render: (invoice: any) => ugx(invoice.balance) }
        ]}
        empty="No invoices have been issued yet."
        rows={invoices}
      />
      <DataTable
        caption="Payment history"
        columns={[
          { heading: "Receipt", render: (payment: any) => payment.receiptNo ?? payment.receipt?.receiptNo ?? "Receipt" },
          { heading: "Invoice", render: (payment: any) => payment.invoiceNo ?? "N/A" },
          { heading: "Date", render: (payment: any) => dateLabel(payment.paidAt) },
          { heading: "Method", render: (payment: any) => titleCase(String(payment.method ?? "payment")) },
          { heading: "Amount", align: "right", render: (payment: any) => ugx(payment.amount) }
        ]}
        empty="No payments have been recorded yet."
        rows={payments}
      />
    </>
  );
}

function TimetableView({ rows }: { rows: any[] }) {
  const grouped = groupBy(rows, (row) => dayLabel(row.dayOfWeek));
  return (
    <section>
      <SectionTitle eyebrow="Class schedule" title="Timetable" helper="Periods are grouped by school day for quicker scanning." />
      {rows.length === 0 ? <EmptyState title="No timetable published yet" helper="The timetable will appear here once the school publishes class periods." /> : (
        <div className="timetable-grid">
          {Object.entries(grouped).map(([day, dayRows]) => (
            <article className="panel timetable-day" key={day}>
              <h3>{day}</h3>
              <ol>
                {(dayRows as any[]).map((row) => (
                  <li key={row.id}>
                    <span>Period {row.periodNumber}</span>
                    <strong>{timeRange(row)}</strong>
                    {row.room && <small>{row.room}</small>}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MoreView({ setActive, logout, unread }: { setActive: (view: string) => void; logout: () => void; unread: number }) {
  return (
    <section>
      <h2>More</h2>
      <div className="more-grid">
        <button type="button" onClick={() => setActive("announcements")}>Announcements</button>
        <button type="button" onClick={() => setActive("notifications")}>Notifications{unread ? ` (${unread})` : ""}</button>
        <button type="button" onClick={logout}>Logout</button>
      </div>
    </section>
  );
}

function ListView({ title, rows }: { title: string; rows: any[] }) {
  return (
    <section>
      <SectionTitle eyebrow="Satelite Secondary" title={title} />
      <div className="list">
        {rows.length === 0 && <EmptyState />}
        {rows.map((row) => <article key={row.id}><strong>{row.title}</strong><p>{row.message ?? row.body}</p></article>)}
      </div>
    </section>
  );
}

function FeedView({ title, rows, kind, compact, onMarkRead }: { title: string; rows: any[]; kind: "announcements" | "notifications"; compact?: boolean; onMarkRead?: (id: string) => void }) {
  const emptyTitle = kind === "announcements" ? "No announcements published" : "No notifications yet";
  const emptyHelper = kind === "announcements" ? "School announcements will appear here when they are published for portal users." : "Personal and school notifications will appear here when available.";
  return (
    <section className={compact ? "feed-section compact" : "feed-section"}>
      <SectionTitle eyebrow={kind === "announcements" ? "School updates" : "Portal inbox"} title={title} />
      <div className="feed-list">
        {rows.length === 0 && <EmptyState title={emptyTitle} helper={emptyHelper} />}
        {rows.map((row) => (
          <article key={row.id} className={kind === "notifications" && !row.readAt ? "unread" : undefined}>
            <div>
              <span>{kind === "announcements" ? titleCase(row.priority ?? "normal") : row.readAt ? "Read" : "Unread"}</span>
              <time dateTime={isoDateTime(row.publishAt ?? row.createdAt)}>{dateLabel(row.publishAt ?? row.createdAt)}</time>
            </div>
            <strong>{row.title}</strong>
            <p>{row.message ?? row.body}</p>
            {kind === "notifications" && !row.readAt && onMarkRead && <button type="button" className="ghost mark-read" onClick={() => onMarkRead(row.id)}>Mark as read</button>}
          </article>
        ))}
      </div>
    </section>
  );
}

function DataTable<T extends { id: string }>({ caption, columns, empty, rows }: { caption: string; columns: TableColumn<T>[]; empty: string; rows: T[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption>{caption}</caption>
        <thead>
          <tr>{columns.map((column) => <th key={column.heading} scope="col" className={column.align === "right" ? "numeric" : undefined}>{column.heading}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="empty-cell" colSpan={columns.length}><EmptyState title={empty} helper="Please check back after the school publishes this information." /></td></tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => <td key={column.heading} className={column.align === "right" ? "numeric" : undefined}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintHeader({ title, student }: { title: string; student?: StudentIdentity }) {
  const className = [student?.currentClass?.name, student?.currentStream?.name].filter(Boolean).join(" ");
  return (
    <div className="print-only print-header">
      <p className="eyebrow">Satelite Secondary School</p>
      <h2>{title}</h2>
      <dl>
        <div><dt>Student</dt><dd>{student ? `${student.firstName} ${student.lastName}` : "Portal student"}</dd></div>
        <div><dt>Admission no.</dt><dd>{student?.admissionNo ?? "N/A"}</dd></div>
        <div><dt>Class</dt><dd>{className || "N/A"}</dd></div>
        <div><dt>Generated</dt><dd>{new Date().toLocaleString()}</dd></div>
      </dl>
    </div>
  );
}

function SectionTitle({ eyebrow, title, helper, action }: { eyebrow: string; title: string; helper?: string; action?: React.ReactNode }) {
  return <header className="section-title"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{helper && <p>{helper}</p>}</div>{action}</header>;
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <article className={danger ? "metric danger" : "metric"}><span>{label}</span><strong>{value}</strong></article>;
}

async function api<T>(path: string, token: string | null, options?: { method?: string; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: options?.method ?? "GET",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: options?.body ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    console.error(error);
    throw new PortalApiError("Cannot reach the school server. Check that the PC server is running and that your phone is on the same Wi-Fi.", String(error));
  }
  if (!response.ok) {
    const text = await response.text();
    console.error("Portal API error", response.status);
    throw new PortalApiError(
      response.status === 401 ? "Check your username and password." : "Something went wrong while loading this information.",
      `Status ${response.status}: ${text}`
    );
  }
  return response.json();
}

class PortalApiError extends Error {
  details?: string;

  constructor(message: string, details?: string) {
    super(message);
    this.name = "PortalApiError";
    this.details = details;
  }
}

function ugx(value: number | string) {
  return `UGX ${Math.round(Number(value ?? 0)).toLocaleString("en-UG")}`;
}

function dateLabel(value?: string | Date | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-UG", { year: "numeric", month: "short", day: "numeric" });
}

function isoDateTime(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function dayLabel(value: number | string) {
  const day = Number(value);
  return Number.isFinite(day) ? `Day ${day}` : "School day";
}

function timeRange(row: { startsAt?: string; endsAt?: string }) {
  return [row.startsAt, row.endsAt].filter(Boolean).join(" - ") || "Time not set";
}

function groupBy<T>(rows: T[], keyFor: (row: T) => string) {
  return rows.reduce<Record<string, T[]>>((groups, row) => {
    const key = keyFor(row);
    groups[key] = [...(groups[key] ?? []), row];
    return groups;
  }, {});
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(title)
    .join(" ");
}

function printPage() {
  window.print();
}

function title(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function readableError(error: unknown): PortalIssue {
  if (error instanceof PortalApiError) return { message: error.message, details: error.details };
  if (error instanceof Error) return { message: "Something went wrong. Please try again.", details: error.message };
  return { message: "Something went wrong. Please try again." };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

type RootElement = HTMLElement & { __aethinaRoot?: ReturnType<typeof createRoot> };
const rootElement = document.getElementById("root")! as RootElement;
const root = rootElement.__aethinaRoot ?? createRoot(rootElement);
rootElement.__aethinaRoot = root;

root.render(
  <React.StrictMode>
    <PortalApp />
  </React.StrictMode>
);
