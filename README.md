# Aethina School Management System

Aethina SMS is a monorepo for a Windows desktop school management application, a student/parent portal, and a NestJS synchronization API.

## Local Tooling Found

- Node.js: installed (`v24.11.0`)
- npm: installed, but PowerShell blocks `npm.ps1`; use `npm.cmd`
- Git: installed (`2.49.0.windows.1`)
- Docker CLI and Compose: installed; Docker reported an access warning for `C:\Users\DELL 7400\.docker\config.json`
- Rust and Cargo: installed through `rustup` for the current user (`rustc 1.97.1`, `cargo 1.97.1`)
- WebView2 Runtime: installed
- Windows C++ build tools: Visual Studio Build Tools 2019 and 2022 are present and expose `cl.exe`, `link.exe`, and `MSBuild.exe` from their developer prompts
- Windows SDK: installed (`10.0.18362.0`) with SDK libraries such as `kernel32.lib`
- winget: present but failed in this session with a logon-session error

Tauri desktop builds require Rust, Cargo, Microsoft C++ build tools, WebView2, and a Windows SDK. These prerequisites are installed on this machine. Run native Tauri commands from a Visual Studio Developer Command Prompt, or another shell that has the Visual Studio build environment loaded.

## Repository Structure

- `apps/desktop`: React + Tauri Windows desktop application with SQLite offline storage.
- `apps/portal`: Responsive React Student/Parent Portal.
- `apps/api`: NestJS backend API, Prisma, PostgreSQL migrations, seed data, and sync service.
- `packages/shared-types`: Shared TypeScript interfaces and enums.
- `packages/validation`: Shared Zod validation schemas.
- `infrastructure`: Docker Compose and local infrastructure configuration.
- `documentation`: Architecture and offline sync notes.

## Prerequisites

- Node.js 20 or newer
- npm
- Git
- Docker Desktop with Compose
- Rust and Cargo for Tauri
- Microsoft C++ Build Tools for Tauri on Windows
- PostgreSQL client tools if you want reset backups through `pg_dump`

## Installation

Create local environment values:

```powershell
Copy-Item .env.example .env
```

The checked-in `.env.example` contains placeholders. The local `.env` is ignored by Git and should only contain development credentials.

Install dependencies:

```powershell
npm.cmd install
```

## Local Database Setup

Start PostgreSQL:

```powershell
npm.cmd run db:start
```

Run Prisma migrations:

```powershell
npm.cmd run db:migrate
```

Seed fictional development data:

```powershell
npm.cmd run db:seed
```

Stop PostgreSQL:

```powershell
npm.cmd run db:stop
```

## Environment Variables

- `NODE_ENV`: must be `development` for seed/reset scripts.
- `POSTGRES_USER`: local PostgreSQL user.
- `POSTGRES_PASSWORD`: local development-only password.
- `POSTGRES_DB`: local database name.
- `POSTGRES_PORT`: local PostgreSQL port.
- `DATABASE_URL`: Prisma PostgreSQL connection string.
- `API_PORT`: NestJS API port.
- `JWT_SECRET`: development-only JWT secret placeholder.
- `SYNC_BATCH_SIZE`: sync batch size.

## Development Commands

```powershell
npm.cmd run api:dev
npm.cmd run desktop:dev
npm.cmd run portal:dev
npm.cmd run test
npm.cmd run build
```

## Demo Login

- Admin/Teacher web app: `https://aethina-sms-admin.vercel.app`
- Student/Parent portal: `https://aethina-sms-portal.vercel.app`
- Admin: `admin@aethina.test` / `AdminPass123`
- Bursar: `bursar@aethina.test` / `BursarPass123`
- Teacher: `grace.otieno@aethina.test` / `TeacherPass123`
- Portal: `sat-s1-001` / `StudentPass123`
- Teacher kiosk: `TCH-001` / `1234`

## Client Demo

The pilot dataset is Satelite Secondary School, a fictional Ugandan high school with Senior One/Senior Two classes, Uganda D1-F9 grade boundaries, teachers, guardians, fees, payments, reports, inventory, payroll, and approvals.

For the presentation runbook, phone access, firewall notes, demo flow, and recovery steps, see `documentation/CLIENT_DEMO.md`. For a user walkthrough, see `documentation/USER_GUIDE.md`.

Useful commands:

```powershell
npm.cmd run demo
npm.cmd run demo:urls
npm.cmd run backup:sqlite
```

For phone access, create `apps/portal/.env.local` from `apps/portal/.env.local.example` and set:

```powershell
VITE_API_URL=http://<PC-LAN-IP>:4000
```

## Phase 1 Desktop Screens

- `Dashboard`: real operational aggregates for students, teachers, current-term fees, collections, outstanding balances, approvals, risk alerts, sync conflicts, and low stock.
- `Students`: registration, profile review, guardian details, portal credential reset, offline queue, and synchronization.
- `Academics`: examinations, assessments, submitted marks review, published report cards, and student academic history visibility.
- `Timetable`: class/stream timetable visibility with teacher/class/room conflict checks in the API.
- `Finance`: fee structures, invoice generation, student invoices, payment recording, receipts, expenses, and initial reports using UGX formatting.
- `Budgets`: departmental/school-wide budget tracking, utilization, and budget request submission.
- `Inventory`: item catalog, stock movements, low-stock monitoring, approval trail, and sensitive conflict review.
- `Payroll`: payroll profiles, components, payroll runs, calculated payroll records, approval gates, and payslip reads.
- `Notifications`: notification queue, templates, announcements, and portal-visible messages.
- `Approvals`: reusable approval inbox for budget requests, expenses, payment reversals, and fee adjustments.
- `School Setup`: school profile, academic years, terms, classes, streams, subjects, and grade boundaries.
- `Attendance`: teacher staff-ID/PIN kiosk, daily teacher attendance register, correction request submission, and administrator approval/rejection.
- `Sync Review`: open synchronization conflicts, including sensitive finance/payroll/budget/inventory conflicts that require administrator review.
- `Risk Alerts`: financial risk alert center for duplicate/suspicious transactions, budget violations, large waivers, reversals, and threshold issues.
- `Audit`: searchable recent audit activity for administrative traceability.

See `documentation/phase1-core.md` for the Phase 1 core endpoint map and offline workflow notes.

## Migration Process

Use Prisma migrations for every PostgreSQL schema change:

```powershell
npm.cmd run db:migrate
```

Preserve existing data when writing migrations. Before a destructive migration, create a backup and get explicit approval. Do not use `prisma db push` for schema changes that should be migrated.

## Database Reset Process

Reset only the development database:

```powershell
npm.cmd run db:reset:dev
```

Safeguards in `apps/api/scripts/reset-dev-db.ts` refuse to reset unless `NODE_ENV=development` and `DATABASE_URL` points at `aethina_sms_dev`. The script attempts a backup with `pg_dump` before running Prisma reset.

## Offline Sync Testing

1. Start PostgreSQL: `npm.cmd run db:start`
2. Run migrations: `npm.cmd run db:migrate`
3. Seed data: `npm.cmd run db:seed`
4. Start the API: `npm.cmd run api:dev`
5. Start the desktop app: `npm.cmd run desktop:dev`
6. Use the teacher attendance kiosk to check in and confirm the API accepts the record.
7. Record an online finance payment and confirm a server receipt is generated.
8. Stop the API to simulate offline mode.
9. Record a payment and an expense in the desktop app. They are written to SQLite and queued in `pending_changes`.
10. Offline receipts use a device/UUID-backed provisional display number such as `OFF-0001-...`. The API assigns the authoritative `RCT-YYYY-#####` receipt number after synchronization.
11. Restart the API.
12. Click `Sync` in the desktop app or push pending changes through `POST /sync/push`.
13. Pull server changes through `POST /sync/pull`.
14. Retry failures through `POST /sync/retry`.
15. Re-send a pending change with the same UUID to verify duplicate protection.
16. Send a stale `baseVersion` for payment, payroll, budget, or inventory records and confirm a `SENSITIVE` synchronization conflict is created for administrator review.

## Phase 1 Finance API

- `GET /dashboard/summary`
- `GET /dashboard/alerts`
- `GET /dashboard/activity`
- `GET/POST /finance/fee-structures`
- `GET /finance/invoices`
- `POST /finance/invoices/generate`
- `POST /finance/invoices/manual`
- `POST /finance/payments`
- `GET /finance/receipts/:id`
- `POST /finance/receipts/:id/reprint`
- `POST /finance/reversals`
- `POST /finance/reversals/:id/approve`
- `POST /finance/reversals/:id/reject`
- `POST /finance/adjustments`
- `GET/POST /finance/budgets`
- `POST /finance/budget-requests`
- `GET/POST /finance/expenses`
- `GET /finance/students/:studentId/profile`
- `GET/POST /finance/settings`
- `GET /finance/reports/:type`
- `GET /approvals`
- `POST /approvals/:id/decision`
- `GET /risk-alerts`
- `POST /risk-alerts/:id/review`

## Phase 1 Operations API

- `GET/POST /academics/examinations`
- `GET/POST /academics/assessments`
- `GET /academics/marks-entry/:assessmentId`
- `POST /academics/marks`
- `POST /academics/assessments/:id/decision`
- `GET /academics/report-cards`
- `POST /academics/report-cards/generate`
- `PUT /academics/report-cards/:id`
- `POST /academics/report-cards/:id/publish`
- `GET /academics/students/:id/history`
- `GET/POST /timetable`
- `GET/POST /inventory/items`
- `GET/POST /inventory/suppliers`
- `GET/POST /inventory/movements`
- `POST /inventory/movements/:id/approve`
- `GET /inventory/reports/:type`
- `GET/POST /payroll/profiles`
- `POST /payroll/components`
- `GET/POST /payroll/runs`
- `POST /payroll/runs/:id/calculate`
- `POST /payroll/runs/:id/submit`
- `POST /payroll/runs/:id/approve`
- `POST /payroll/runs/:id/process`
- `GET /payroll/records`
- `GET /payroll/payslips/:id`
- `GET /notifications`
- `POST /notifications/queue`
- `POST /notifications/:id/process`
- `GET/POST /notifications/templates`
- `GET/POST /announcements`
- `GET /portal/home`
- `GET /portal/finance`
- `GET /portal/academics`
- `GET /portal/timetable`
- `GET /portal/announcements`
- `GET /portal/notifications`
- `POST /portal/notifications/:id/read`
- `POST /portal/change-password`

## Latest Verification

Completed locally on August 17, 2026:

- `npm.cmd run db:start`
- `npm.cmd run prisma:generate --workspace apps/api`
- `npx.cmd prisma migrate deploy --schema apps/api/prisma/schema.prisma`
- `npm.cmd run db:seed`
- `npm.cmd run test`
- `npm.cmd run build --workspace apps/api`
- `npm.cmd run build --workspace apps/desktop`
- `npm.cmd run build --workspace apps/portal`
- `npm.cmd run build --workspace packages/shared-types`
- `npm.cmd run build --workspace packages/validation`
- Authenticated API probes for dashboard, academics, inventory, payroll, announcements, and portal home.

Note: `npm.cmd run db:migrate` still uses `prisma migrate dev`, and an older migration in this repository does not replay cleanly on Prisma's shadow database. For applying checked-in migrations to the local development database, use `npx.cmd prisma migrate deploy --schema apps/api/prisma/schema.prisma`.

## Phase 1 Scope Notes

Student attendance is not active in Phase 1. The architecture remains extensible through devices, local SQLite, synchronization metadata, and conflict review for future hardware-backed attendance.

Teacher attendance is active through the desktop kiosk using staff ID and PIN, check-in, check-out, late status, correction requests, and administrator approval.

## Safeguards

- Never commit `.env`, SQLite database files, secrets, production credentials, backups, or build output.
- Never reset or delete a database unless the environment is explicitly marked development.
- Back up and request approval before destructive migrations.
- Use Prisma migrations for PostgreSQL schema changes.
- Preserve existing data when applying migrations.
- Do not use last-write-wins for finance, payroll, budgets, or inventory.
- Send sensitive conflicts to administrator review.

## Troubleshooting

- If `npm` fails in PowerShell because scripts are disabled, run `npm.cmd`.
- If Docker reports access denied for `C:\Users\DELL 7400\.docker\config.json`, fix Docker Desktop user permissions or run Docker Desktop under the current Windows user.
- If Tauri fails with `cannot open input file 'kernel32.lib'`, install or repair the Windows SDK, then open a Visual Studio Developer Command Prompt and run `npm.cmd run desktop:dev`.
- If `rustc` or `cargo` are not found in a new shell, restart the terminal or add `%USERPROFILE%\.cargo\bin` to PATH.
- If Prisma cannot connect, confirm PostgreSQL is running and `DATABASE_URL` matches `.env`.
- If reset backup fails, install PostgreSQL client tools so `pg_dump` is available.
