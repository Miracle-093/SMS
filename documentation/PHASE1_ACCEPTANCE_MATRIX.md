# Aethina SMS Phase One Acceptance Matrix

Target: Aethina SMS Phase One - Client Acceptance and Pilot Release for Satelite Secondary School.

This matrix covers only Phase One workflows used during client acceptance. Use fictional seeded demo data only.

## Preflight

Run from `C:\Users\DELL 7400\Desktop\Aethina SMS`:

```powershell
npm.cmd run db:start
npm.cmd run db:migrate:deploy
npm.cmd run db:seed
npm.cmd run test
npm.cmd run build
npm.cmd run offline:smoke
```

Expected:

- All checked-in Prisma migrations apply with `migrate deploy`.
- Seed creates Satelite Secondary School demo data.
- API, desktop, portal, shared-types, and validation tests pass.
- Root build passes.
- Offline smoke returns `SYNCED`, duplicate protection `true`, and sensitive conflict handling.

## Roles And Workflows

| Role | Workflow | Acceptance Check | Status |
| --- | --- | --- | --- |
| Administrator | Login and dashboard | User logs in, sees school dashboard, role-specific navigation, sync/risk/audit links. | Ready |
| Administrator | Users and roles | Create staff user, assign roles, reset temporary password, activate/deactivate staff without deactivating self. | Ready |
| Administrator | Student management | Register student with guardian, class/stream/year, and portal credentials. | Ready |
| Administrator | Sync review | View sensitive conflict, resolve/reject conflict, retry authenticated sync. | Ready |
| Bursar | Fee structures | Create fee structure only with valid class/name/positive amount. | Ready |
| Bursar | Invoice generation | Generate term invoices without duplicating existing invoices. | Ready |
| Bursar | Payments and receipts | Record partial payment within invoice balance, create receipt, update balance. | Ready |
| Bursar | Expenses and budgets | Record valid expense, create budget, submit budget request, review approval/risk path. | Ready |
| DOS/Academic administrator | Academic setup | Create exam and assessment with class, subject, teacher, max score, and weight. | Ready |
| Teacher/Class teacher | Marks entry | Select assigned assessment, load roster, enter scores, save draft, submit for DOS review. | Ready |
| DOS/Academic administrator | Marks review | Approve, return, or publish submitted assessment results. | Ready |
| Class teacher | Report preparation | Generate/prepare assigned report cards for DOS approval. | Ready |
| Head teacher | Oversight | Review dashboard, approvals, academic/finance summaries as permitted. | Ready |
| Attendance administrator | Teacher attendance | Kiosk check-in/check-out, request correction, approve/reject correction with ownership validation. | Ready |
| Student/parent portal user | Portal essentials | Login, see dashboard, finance, academics, timetable, announcements, notifications; failed loads show retry state. | Ready |

## Deferred For Later Phases

- Advanced SMS/email retry monitoring.
- Advanced push notification infrastructure.
- Complex DataTable resizing/customization.
- Advanced analytics.
- New modules beyond Phase One.
- Full offline coverage for every module.
- Perfect PDF output for every report.
- Nonessential exports.

## Release Cautions

- Do not run `prisma db push` for release schema changes.
- Do not seed or reset production data without explicit approval and a fresh backup.
- Do not publish real student data in demo screenshots or exported reports.
- Treat the listed demo credentials as fictional pilot-only credentials.
