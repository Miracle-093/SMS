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

function PortalApp() {
  const [session, setSession] = useState<Session | null>(() => readJson("aethina.portal.session", null));
  const [username, setUsername] = useState("adm-001");
  const [password, setPassword] = useState("StudentPass123");
  const [active, setActive] = useState("home");
  const [home, setHome] = useState<PortalHome | null>(null);
  const [academics, setAcademics] = useState<any>(null);
  const [finance, setFinance] = useState<any>(null);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [error, setError] = useState("");
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
    setError("");
    try {
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
      setError(readableError(err));
    }
  }

  function logout() {
    localStorage.removeItem("aethina.portal.session");
    setSession(null);
    setHome(null);
  }

  if (!session) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={login}>
          <p className="eyebrow">Satelite Secondary</p>
          <h1>Student Portal</h1>
          <p className="slogan">Kampala, Uganda</p>
          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {error && <p className="error">{error}</p>}
          <button disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
        </form>
      </main>
    );
  }

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
          <button key={view} className={active === view ? "active" : ""} onClick={() => setActive(view)}>
            {view === "notifications" && unread ? `Notifications (${unread})` : title(view)}
          </button>
        ))}
        <button onClick={logout}>Sign out</button>
      </aside>
      <section className="content">
        {error && <p className="error">{error}</p>}
        {active === "home" && <HomeView home={home} />}
        {active === "academics" && <AcademicsView data={academics} />}
        {active === "finance" && <FinanceView data={finance} />}
        {active === "timetable" && <TimetableView rows={timetable.length ? timetable : home?.timetable ?? []} />}
        {active === "announcements" && <ListView title="Announcements" rows={announcements.length ? announcements : home?.announcements ?? []} />}
        {active === "notifications" && <ListView title="Notifications" rows={notifications.length ? notifications : home?.notifications ?? []} />}
        {active === "more" && <MoreView setActive={setActive} logout={logout} unread={unread} />}
      </section>
      <nav className="bottom-nav">
        {primaryViews.map((view) => (
          <button key={view} className={active === view ? "active" : ""} onClick={() => setActive(view)}>
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

function AcademicsView({ data }: { data: any }) {
  const marks = data?.marks ?? [];
  const cards = data?.reportCards ?? [];
  if (!data) return <Skeleton title="Loading academics" />;
  return (
    <>
      <h2>Academics</h2>
      <div className="table">
        {marks.length === 0 && <p className="empty">No published marks yet.</p>}
        {marks.map((mark: any) => <div className="row" key={mark.id}><span>{mark.subject?.name}</span><strong>{mark.score} ({mark.grade ?? "N/A"})</strong></div>)}
      </div>
      <h3>Report cards</h3>
      <div className="table">
        {cards.length === 0 && <p className="empty">No report cards published yet.</p>}
        {cards.map((card: any) => <div className="row" key={card.id}><span>{new Date(card.generatedAt).toLocaleDateString()}</span><strong>{card.grade} / {Number(card.averageScore).toFixed(0)}</strong></div>)}
      </div>
    </>
  );
}

function FinanceView({ data }: { data: any }) {
  if (!data) return <Skeleton title="Loading finance" />;
  const summary = data.summary ?? { expected: 0, paid: 0, balance: 0 };
  return (
    <>
      <h2>Finance</h2>
      <section className="stats">
        <Metric label="Expected" value={ugx(summary.expected)} />
        <Metric label="Paid" value={ugx(summary.paid)} />
        <Metric label="Balance" value={ugx(summary.balance)} danger={summary.balance > 0} />
      </section>
      <div className="table">
        {(data.invoices ?? []).length === 0 && <p className="empty">No invoices have been issued yet.</p>}
        {(data.invoices ?? []).map((invoice: any) => <div className="row" key={invoice.id}><span>{invoice.invoiceNo} - {invoice.status}</span><strong>{ugx(invoice.balance)}</strong></div>)}
      </div>
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
      <h2>{title}</h2>
      <div className="list">
        {rows.length === 0 && <p className="empty">No records yet.</p>}
        {rows.map((row) => <article key={row.id}><strong>{row.title}</strong><p>{row.message ?? row.body}</p></article>)}
      </div>
    </section>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <article className={danger ? "metric danger" : "metric"}><span>{label}</span><strong>{value}</strong></article>;
}

function Skeleton({ title }: { title: string }) {
  return <section className="skeleton"><h2>{title}</h2><div /><div /><div /></section>;
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
