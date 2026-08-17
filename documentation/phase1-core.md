# Phase 1 Core Implementation

This phase implements the production foundation for authentication, school configuration, student admissions, promotion history, audit logging, teacher attendance, finance, academics, timetable, inventory, payroll, notifications, portal access, and offline synchronization foundations.

## Demo Credentials

- School administrator: `admin@aethina.test`
- Password: `AdminPass123`

Seeded teacher accounts use `TeacherPass123` and require password change.

## API Endpoints

- `POST /auth/login`
- `POST /auth/portal-login`
- `POST /auth/logout`
- `POST /auth/change-password`
- `GET /users`
- `POST /users/:id/activate`
- `POST /users/:id/deactivate`
- `POST /users/reset-password`
- `GET /school-config`
- `PUT /school-config/profile`
- `POST /school-config/academic-years`
- `POST /school-config/terms`
- `POST /school-config/classes`
- `POST /school-config/streams`
- `POST /school-config/subjects`
- `POST /school-config/grade-boundaries`
- `GET /students`
- `GET /students/:id`
- `POST /students`
- `PUT /students/:id`
- `POST /students/:id/activate`
- `POST /students/:id/deactivate`
- `POST /students/:id/reset-portal-credentials`
- `POST /students/promotions`
- `GET/POST /academics/examinations`
- `GET/POST /academics/assessments`
- `GET /academics/marks-entry/:assessmentId`
- `POST /academics/marks`
- `POST /academics/assessments/:id/decision`
- `GET /academics/report-cards`
- `POST /academics/report-cards/generate`
- `POST /academics/report-cards/:id/publish`
- `GET/POST /timetable`
- `GET/POST /inventory/items`
- `GET/POST /inventory/movements`
- `GET/POST /payroll/profiles`
- `GET/POST /payroll/runs`
- `GET/POST /notifications/templates`
- `GET/POST /announcements`
- `GET /portal/home`
- `GET /portal/finance`
- `GET /portal/academics`
- `GET /portal/timetable`
- `GET /portal/announcements`
- `GET /portal/notifications`

## Offline Student Workflow

The desktop application keeps offline student registrations and edits in a local pending queue with globally unique IDs. When the API is available, pending records are pushed to `POST /sync/push`. Student registrations replay through the backend student service so duplicate admission numbers, placement validation, portal credential generation, and audit logs still apply.

The Tauri SQLite migrations include the offline Phase 1 tables for students, guardians, student-guardian links, portal account metadata, promotions, finance records, marks, inventory movements, payroll records, notifications, announcements, pending changes, conflicts, and sync metadata.

## Audit Coverage

Audit logs are recorded for login success/failure, logout, password changes, user activation/deactivation, user password reset, school configuration changes, student creation/editing, portal credential reset, student promotion, finance activity, marks submission/approval, report card generation/publishing, timetable changes, inventory movement, payroll run workflow, announcements, notifications, sync conflict decisions, and risk review.

## Current Boundaries

Student attendance remains intentionally out of Phase 1. The architecture stays extensible through device records, sync metadata, local SQLite, and conflict review for future hardware-backed attendance integration.
