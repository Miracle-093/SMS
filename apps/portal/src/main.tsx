import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiBaseUrl } from "./config.js";
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

function PortalApp() {
  const [session, setSession] = useState<Session | null>(() => readJson("aethina.portal.session", null));
  const [username, setUsername] = useState("sat-s1-001");
  const [password, setPassword] = useState("StudentPass123");
  const [active, setActive] = useState("home");
  const [home, setHome] = useState<PortalHome | null>(null);
  const [academics, setAcademics] = useState<any>(null);
  const [finance, setFinance] = useState<any>(null);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [viewErrors, setViewErrors] = useState<Partial<Record<LoadableView, string>>>({});
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
    setError("");
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
    setError("");
    try {
      const loadableView = loadableViews.includes(view as LoadableView) ? view as LoadableView : null;
      if (loadableView) setViewErrors((current) => ({ ...current, [loadableView]: "" }));
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
      const message = readableError(err);
      setError(message);
      const loadableView = loadableViews.includes(view as LoadableView) ? view as LoadableView : null;
      if (loadableView) setViewErrors((current) => ({ ...current, [loadableView]: message }));
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

  if (!session) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={login}>
          <p className="eyebrow">Satelite Secondary</p>
          <h1>Student Portal</h1>
          <p className="slogan">Kampala, Uganda</p>
          <div className="demo-strip">Demo: sat-s1-001 / StudentPass123</div>
          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button disabled={loading} aria-busy={loading}>{loading ? "Signing in..." : "Sign in"}</button>
        </form>
      </main>
    );
  }

  const studentIdentity = home?.student;
  const activeLoadableView = loadableViews.includes(active as LoadableView) ? active as LoadableView : null;
  const activeError = activeLoadableView ? viewErrors[activeLoadableView] : "";

  return (
    <main className="portal">
      <header className="mobile-top">
        <div><strong>Satelite Secondary</strong><span>{session.user.displayName}</span></div>
        <button className="text-button" onClick={logout}>Logout</button>
      </header>
      <aside>
        <h1>Satelite</h1>
        <p>Secondary School</p>
        <strong>{session.user.displayName}</strong>
        {["home", "academics", "finance", "timetable", "announcements", "notifications"].map((view) => (
          <button key={view} className={active === view ? "active" : ""} aria-current={active === view ? "page" : undefined} onClick={() => setActive(view)}>
            {view === "notifications" && unread ? `Notifications (${unread})` : title(view)}
          </button>
        ))}
        <button onClick={logout}>Sign out</button>
      </aside>
      <section className="content" aria-busy={loading}>
        {activeError && <p className="error" role="alert">{activeError}</p>}
        {active === "home" && (viewErrors.home && !loading && !home ? <LoadFailed title="Dashboard unavailable" onRetry={() => void refresh(session.accessToken, "home")} /> : <HomeView home={home} />)}
        {active === "academics" && (viewErrors.academics && !loading && !academics ? <LoadFailed title="Academics unavailable" onRetry={() => void refresh(session.accessToken, "academics")} /> : <AcademicsView data={academics} student={studentIdentity} />)}
        {active === "finance" && (viewErrors.finance && !loading && !finance ? <LoadFailed title="Finance unavailable" onRetry={() => void refresh(session.accessToken, "finance")} /> : <FinanceView data={finance} student={studentIdentity} />)}
        {active === "timetable" && (viewErrors.timetable && !loading ? <LoadFailed title="Timetable unavailable" onRetry={() => void refresh(session.accessToken, "timetable")} /> : <TimetableView rows={timetable.length ? timetable : home?.timetable ?? []} />)}
        {active === "announcements" && (viewErrors.announcements && !loading ? <LoadFailed title="Announcements unavailable" onRetry={() => void refresh(session.accessToken, "announcements")} /> : <ListView title="Announcements" rows={announcements.length ? announcements : home?.announcements ?? []} />)}
        {active === "notifications" && (viewErrors.notifications && !loading ? <LoadFailed title="Notifications unavailable" onRetry={() => void refresh(session.accessToken, "notifications")} /> : <ListView title="Notifications" rows={notifications.length ? notifications : home?.notifications ?? []} />)}
        {active === "more" && <MoreView setActive={setActive} logout={logout} unread={unread} />}
      </section>
      <nav className="bottom-nav">
        {primaryViews.map((view) => (
          <button key={view} className={active === view ? "active" : ""} aria-current={active === view ? "page" : undefined} onClick={() => setActive(view)}>
            {view === "more" && unread ? `More (${unread})` : title(view)}
          </button>
        ))}
      </nav>
    </main>
  );
}

function HomeView({ home }: { home: PortalHome | null }) {
  if (!home) return <Skeleton title="Loading portal dashboard" />;
  return (
    <>
      <header className="topline">
        <div>
          <p className="eyebrow">{home.student.admissionNo}</p>
          <h2>{home.student.firstName} {home.student.lastName}</h2>
          <p>{home.student.currentClass?.name} {home.student.currentStream?.name ?? ""}</p>
        </div>
        <strong>{home.latestReport ? `Latest grade ${home.latestReport.grade}` : "No published report yet"}</strong>
      </header>
      <section className="stats">
        <Metric label="Fee balance" value={ugx(home.finance.balance)} danger={home.finance.balance > 0} />
        <Metric label="Paid this term" value={ugx(home.finance.paid)} />
        <Metric label="Latest result" value={home.latestReport ? `${home.latestReport.grade}` : "Pending"} />
      </section>
      <section className="quick-card">
        <h3>Today at a glance</h3>
        <p>{home.timetable[0] ? `Next class: Day ${home.timetable[0].dayOfWeek}, Period ${home.timetable[0].periodNumber}` : "No timetable items published yet."}</p>
      </section>
      <section className="split">
        <ListView title="Announcements" rows={home.announcements.slice(0, 3)} />
        <ListView title="Notifications" rows={home.notifications.slice(0, 3)} />
      </section>
    </>
  );
}

function AcademicsView({ data, student }: { data: any; student?: StudentIdentity }) {
  const marks = data?.marks ?? [];
  const cards = data?.reportCards ?? [];
  if (!data) return <Skeleton title="Loading academics" />;
  return (
    <>
      <SectionTitle eyebrow="Uganda grading" title="Academics" helper="Published marks and report cards use D1-F9 grade boundaries." action={<button type="button" className="ghost no-print" onClick={printPage}>Print</button>} />
      <PrintHeader title="Academic Results / Report Card" student={student} />
      <DataTable
        caption="Published marks"
        columns={[
          { heading: "Subject", render: (mark: any) => mark.subject?.name ?? "Subject" },
          { heading: "Assessment", render: (mark: any) => mark.assessment?.examination?.name ?? mark.assessment?.name ?? "Published mark" },
          { heading: "Score", align: "right", render: (mark: any) => `${mark.score} (${mark.grade ?? "N/A"})` }
        ]}
        empty="No published marks yet."
        rows={marks}
      />
      <h3>Report cards</h3>
      <DataTable
        caption="Published report cards"
        columns={[
          { heading: "Generated", render: (card: any) => new Date(card.generatedAt).toLocaleDateString() },
          { heading: "Grade", render: (card: any) => card.grade ?? "N/A" },
          { heading: "Average", align: "right", render: (card: any) => Number(card.averageScore).toFixed(0) }
        ]}
        empty="No report cards published yet."
        rows={cards}
      />
    </>
  );
}

function FinanceView({ data, student }: { data: any; student?: StudentIdentity }) {
  if (!data) return <Skeleton title="Loading finance" />;
  const summary = data.summary ?? { expected: 0, paid: 0, balance: 0 };
  return (
    <>
      <SectionTitle eyebrow="Term billing" title="Finance" helper="Track issued invoices, payments received, and outstanding balances." action={<button type="button" className="ghost no-print" onClick={printPage}>Print</button>} />
      <PrintHeader title="Student Invoice / Fee Statement" student={student} />
      <section className="stats">
        <Metric label="Expected" value={ugx(summary.expected)} />
        <Metric label="Paid" value={ugx(summary.paid)} />
        <Metric label="Balance" value={ugx(summary.balance)} danger={summary.balance > 0} />
      </section>
      <DataTable
        caption="Issued invoices"
        columns={[
          { heading: "Invoice", render: (invoice: any) => invoice.invoiceNo },
          { heading: "Status", render: (invoice: any) => title(String(invoice.status ?? "pending").toLowerCase()) },
          { heading: "Balance", align: "right", render: (invoice: any) => ugx(invoice.balance) }
        ]}
        empty="No invoices have been issued yet."
        rows={data.invoices ?? []}
      />
    </>
  );
}

function TimetableView({ rows }: { rows: any[] }) {
  return <ListView title="Timetable" rows={rows.map((row) => ({ id: row.id, title: `Day ${row.dayOfWeek}, Period ${row.periodNumber}`, message: `${row.startsAt}-${row.endsAt}${row.room ? ` - ${row.room}` : ""}` }))} />;
}

function MoreView({ setActive, logout, unread }: { setActive: (view: string) => void; logout: () => void; unread: number }) {
  return (
    <section>
      <h2>More</h2>
      <div className="more-grid">
        <button onClick={() => setActive("announcements")}>Announcements</button>
        <button onClick={() => setActive("notifications")}>Notifications{unread ? ` (${unread})` : ""}</button>
        <button onClick={logout}>Logout</button>
      </div>
    </section>
  );
}

function ListView({ title, rows }: { title: string; rows: any[] }) {
  return (
    <section>
      <SectionTitle eyebrow="Satelite Secondary" title={title} />
      <div className="list">
        {rows.length === 0 && <p className="empty">No records yet.</p>}
        {rows.map((row) => <article key={row.id}><strong>{row.title}</strong><p>{row.message ?? row.body}</p></article>)}
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
          <tr>{columns.map((column) => <th key={column.heading} className={column.align === "right" ? "numeric" : undefined}>{column.heading}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="empty-cell" colSpan={columns.length}>{empty}</td></tr>
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

function Skeleton({ title }: { title: string }) {
  return <section className="skeleton"><h2>{title}</h2><div /><div /><div /></section>;
}

function LoadFailed({ title, onRetry }: { title: string; onRetry: () => void }) {
  return <section className="load-failed"><h2>{title}</h2><p>The portal could not load this section. Check the connection and try again.</p><button type="button" onClick={onRetry}>Retry</button></section>;
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
    throw new Error("Cannot reach the school server. Check that the PC server is running and that your phone is on the same Wi-Fi.");
  }
  if (!response.ok) {
    const text = await response.text();
    console.error("Portal API error", response.status, text);
    throw new Error(response.status === 401 ? "Check your username and password." : "Something went wrong while loading this information.");
  }
  return response.json();
}

function ugx(value: number | string) {
  return `UGX ${Math.round(Number(value ?? 0)).toLocaleString("en-UG")}`;
}

function printPage() {
  window.print();
}

function title(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PortalApp />
  </React.StrictMode>
);
