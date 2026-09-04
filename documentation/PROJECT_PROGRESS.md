# Aethina SMS Project Progress

Last updated: September 5, 2026

## Project Overview

Aethina SMS is now set up as a monorepo for Satelite Secondary School, a fictional Ugandan high school pilot. The system includes an administrator/teacher/bursar web shell, a student/parent portal, a NestJS API, PostgreSQL/Prisma backend storage, local SQLite offline support for the desktop application, and synchronization foundations for offline-first workflows.

## Repository

- GitHub repository: `https://github.com/Miracle-093/SMS.git`
- Local workspace: `C:\Users\DELL 7400\Desktop\Aethina SMS`
- Current main branch includes the latest UI, deployment, documentation, seed, schema, and Phase 1 workflow work through commit `4595257faa0d9ac9c3ae61e02f2ec2d53338697d`.

## Live Applications

- Admin / Teacher / Bursar app: `https://aethina-sms-admin.vercel.app`
- Student / Parent Portal: `https://aethina-sms-portal.vercel.app`
- API health endpoint: `https://aethina-sms-api.vercel.app/health`

## Monorepo Structure

- `apps/desktop`: React + TypeScript admin/teacher desktop shell with Tauri and SQLite offline support.
- `apps/portal`: responsive React + TypeScript student/parent portal.
- `apps/api`: NestJS backend API with Prisma, PostgreSQL schema, migrations, seed data, auth, sync, and Phase 1 modules.
- `packages/shared-types`: shared TypeScript enums and interfaces.
- `packages/validation`: shared Zod validation schemas.
- `infrastructure`: Docker Compose local PostgreSQL configuration.
- `documentation`: architecture, setup, demo, deployment, and user guides.

## Environment And Tooling

The local development machine was inspected and prepared with:

- Node.js and npm.
- Git.
- Rust and Cargo for Tauri.
- WebView2 runtime.
- Microsoft C++ Build Tools and Windows SDK for Windows Tauri builds.
- Docker CLI and Docker Compose.
- GitHub remote configured.
- Vercel projects created for API, portal, and admin shell.

PowerShell may block `npm.ps1`, so project commands use `npm.cmd`.

## Backend Foundation

The backend is a NestJS API using Prisma ORM with PostgreSQL. It includes:

- Authentication for staff users.
- Student portal authentication.
- Role and permission model with separated Administrator, Dean of Studies, Class Teacher, Teacher, and Bursar responsibilities.
- School setup endpoints.
- Student management endpoints.
- Finance endpoints.
- Academics endpoints.
- Teacher attendance endpoints.
- Approval workflow endpoints.
- Inventory endpoints.
- Payroll endpoints.
- Notifications and announcements.
- Audit logs.
- Dashboard summaries.
- Offline synchronization endpoints.
- Conflict review endpoints.

## Database Work Completed

The PostgreSQL schema covers the requested Phase 1 foundation:

- Schools.
- Users.
- Roles and permissions.
- Students.
- Guardians.
- Student portal credentials.
- Classes and streams.
- Academic years and terms.
- Student promotions.
- Teachers.
- Teacher attendance.
- Subjects.
- Examinations and assessments.
- Marks.
- Grade boundaries.
- Report cards.
- Fee structures.
- Student invoices.
- Payments.
- Payment reversals.
- Expenses.
- Budgets.
- Budget requests.
- Approval workflows.
- Inventory items.
- Stock movements.
- Payroll records.
- Notifications.
- Audit logs.
- Devices.
- Synchronization records.
- Synchronization conflicts.

Student attendance is intentionally not active in Phase 1. The architecture remains extensible for future hardware-backed student attendance.

## Offline And Sync Foundation

The Tauri desktop app includes local SQLite support for offline-capable Phase 1 workflows. Syncable records include common synchronization metadata such as:

- `id`
- `schoolId`
- `deviceId`
- `createdBy`
- `createdAt`
- `updatedAt`
- `version`
- `syncStatus`
- `lastSyncedAt`
- `approvalStatus`
- `deletedAt`

Implemented sync foundation:

- Pending local change queue.
- Push pending records to the API.
- Pull server-side changes.
- Retry failed synchronization.
- Duplicate protection using stable IDs.
- Version conflict detection.
- Sensitive conflict routing for administrator review.
- No last-write-wins behavior for finance, payroll, budgets, or inventory.

## Phase 1 Modules

The Admin / Teacher / Bursar app currently includes:

- Dashboard.
- Students.
- Academics.
- Timetable.
- Finance.
- Budgets.
- Inventory.
- Payroll.
- Notifications.
- Approvals.
- School Setup.
- Teacher Attendance.
- Sync Review.
- Risk Alerts.
- Audit.

The Student / Parent Portal currently includes:

- Home dashboard.
- Finance summary.
- Academics.
- Report cards.
- Timetable.
- Announcements.
- Notifications.

## Teacher Attendance

Teacher attendance is active through the desktop/admin attendance kiosk:

- Staff ID and PIN check-in.
- Staff ID and PIN check-out.
- Late status support.
- Correction request submission.
- Administrator approval or rejection of correction requests.
- Daily attendance register.

Demo kiosk credentials:

- Staff ID: `TCH-001`
- PIN: `1234`

## Pilot School Dataset

The system has been seeded with fictional Satelite Secondary School data for a Ugandan high school context:

- One school: Satelite Secondary School.
- One administrator.
- One Dean of Studies.
- One bursar.
- Six teachers.
- Thirty students.
- Guardians.
- Senior One and Senior Two classes.
- Stream East.
- Uganda-style grades: `D1`, `D2`, `C3`, `C4`, `C5`, `C6`, `P7`, `P8`, `F9`.
- Subjects such as Mathematics, English Language, Biology, History, Geography, and Entrepreneurship.
- Sample fee structures.
- Sample invoices and payments.
- Sample examinations, assessments, marks, and report cards.
- Sample inventory.
- Sample payroll data.
- Sample budget request.
- Sample notifications and announcements.

## Demo Accounts

- Admin: `admin@aethina.test` / `AdminPass123`
- Dean of Studies: `dos@satelitesecondary.test` / `DosPass123`
- Bursar: `bursar@aethina.test` / `BursarPass123`
- Class Teacher: `grace.otieno@aethina.test` / `TeacherPass123`
- Teacher: `samuel.kiprotich@aethina.test` / `TeacherPass123`
- Student portal: `sat-s1-001` / `StudentPass123`
- Teacher kiosk: `TCH-001` / `1234`

## UI Improvements Completed

The UI has been improved across the admin shell and student portal:

- Dedicated online Admin / Teacher / Bursar app deployed.
- Student Portal kept separate for students and parents.
- Admin app navigation now filters visible sections by the logged-in user's permissions.
- Role context cards now distinguish the School Administrator Console, Dean of Studies workspace, Class Teacher workspace, Bursar & Accounts Workspace, and Teacher Workspace.
- DOS-only permissions now cover admissions, academic setup, subject allocation, class-teacher allocation, timetable management, and final report-card publishing.
- Teachers are scoped to assigned classes/subjects for student visibility, timetable visibility, and marks entry.
- Class teachers can prepare assigned report cards; DOS approval is required before publishing to the portal.
- The bursar dashboard is finance-only and hides academic, attendance, risk, inventory, and report-card widgets.
- Mobile navigation added for the admin app.
- Responsive layouts improved for phone and desktop screens.
- Tables made scroll-safe on small screens.
- Buttons improved with clearer hover, focus, disabled, and touch states.
- Login screens improved with clearer pilot school identity and demo credentials.
- Portal default login corrected to the Satelite student account.
- Dashboard, finance, attendance, portal finance, and portal navigation polished.
- Admin sections hardened against unexpected API list responses to prevent blank screens.
- Admin shell now has PWA manifest, icon, and service-worker shell caching for installable access.

## Deployment Work Completed

Three Vercel projects were created and deployed:

- `aethina-sms-api`
- `aethina-sms-portal`
- `aethina-sms-admin`

Deployment configuration files:

- `vercel.api.json`
- `vercel.portal.json`
- `vercel.admin.json`

The hosted API CORS configuration allows both:

- `https://aethina-sms-admin.vercel.app`
- `https://aethina-sms-portal.vercel.app`

## Safeguards Added

- `.env` files are ignored by Git.
- SQLite database files are ignored by Git.
- Logs, build output, backups, and Tauri build artifacts are ignored.
- Development database reset is guarded.
- Reset scripts refuse unsafe environments.
- PostgreSQL schema changes are migration-based.
- Sensitive sync conflicts require administrator review.

## Verification Completed

Recent checks completed successfully:

- `npm.cmd run test`
- `npm.cmd run build`
- `npm.cmd run build:vercel:api`
- `npm.cmd run offline:smoke`
- `npm.cmd run acceptance:phase1` with 14/14 scenarios passing
- `npm.cmd run test --workspace apps/api`
- `npm.cmd run test --workspace apps/desktop`
- `npm.cmd run test --workspace apps/portal`
- `npm.cmd run build --workspace apps/desktop`
- `npm.cmd run build --workspace apps/portal`
- Hosted Admin URL returned HTTP 200.
- Hosted Portal URL returned HTTP 200.
- Hosted API health returned `status: ok` and `database: ok`.
- Admin login verified against hosted API.
- Student portal login verified against hosted API.
- Browser responsive smoke testing was completed for desktop and phone layouts using mocked API responses.
- Production Vercel deployments were refreshed on 2026-09-05 for API, admin/staff, and student/parent portal.

## Important Current Boundaries

The system is now a strong Phase 1 pilot, but it is not yet a finished commercial SMS. Current boundaries:

- Student attendance is not active in Phase 1.
- Native mobile apps are not implemented.
- File uploads are metadata/URL based only.
- Payment gateway integration is not connected.
- Advanced reporting/exporting is still basic.
- Multi-school production tenancy needs additional hardening before real deployments.
- User management screens can be expanded further for production administration.

## Recommended Next Work

Recommended next build priorities:

1. Complete full user and role management screens.
2. Expand teacher and class-teacher workspace tools for class imports, class portal ownership, and controlled marks editing.
3. Expand Bursar Workspace workflows for reminders, cash-flow views, and budget record keeping.
4. Add richer DOS scope management for lower, middle, and upper school academic offices.
5. Add file upload storage for student photos and documents.
6. Add stronger dashboard charts and school leadership reports.
7. Add audit-friendly approval detail screens.
8. Add end-to-end browser tests as committed test scripts.
9. Add production security hardening before using real school data.
