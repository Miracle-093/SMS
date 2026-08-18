# Satelite Secondary User Guide

Live demo:

- Admin/Teacher: `https://aethina-sms-admin.vercel.app`
- Portal: `https://aethina-sms-portal.vercel.app`
- API: `https://aethina-sms-api.vercel.app`

## Demo Accounts

- Administrator: `admin@aethina.test` / `AdminPass123`
- Bursar: `bursar@aethina.test` / `BursarPass123`
- Teacher: `grace.otieno@aethina.test` / `TeacherPass123`
- Student portal: `sat-s1-001` / `StudentPass123`
- Teacher kiosk: staff ID `TCH-001`, PIN `1234`

## Administrator

1. Open `https://aethina-sms-admin.vercel.app`.
2. Sign in to the admin app.
3. Open `Dashboard` to review students, teachers, fees, approvals, risk alerts, low stock, payroll, and sync status.
4. Open `School Setup` to review Senior One/Senior Two classes, streams, subjects, terms, and Uganda grade boundaries.
5. Open `Students` to view learners, guardians, admission numbers, and portal credentials.
6. Use `Reset Portal` when a student or guardian needs a new temporary portal password.
7. Open `Approvals` to approve or reject budget, expense, payroll, and payment-reversal requests.
8. Open `Audit` to inspect sensitive administrative activity.

## Finance

1. Sign in as the bursar.
2. Open `Finance`.
3. Review fee structures, invoices, payments, receipts, expenses, and budgets.
4. Record a payment against an invoice.
5. Submit high-value expenses for approval.
6. Check `Risk Alerts` for high-value transactions, waivers, reversals, and budget warnings.

## Academics

1. Sign in as an administrator or teacher.
2. Open `Academics`.
3. Review exams, assessments, marks, and report cards.
4. Use Uganda grading boundaries: `D1`, `D2`, `C3`, `C4`, `C5`, `C6`, `P7`, `P8`, `F9`.
5. Publish approved report cards so students and guardians can see them in the portal.

## Teacher Attendance

1. Open the teacher attendance kiosk.
2. Enter staff ID `TCH-001` and PIN `1234`.
3. Check in at arrival and check out at departure.
4. Submit a correction request if a time is wrong.
5. An administrator reviews and approves or rejects the correction.

## Student/Parent Portal

1. Open `https://aethina-sms-portal.vercel.app`.
2. Sign in with `sat-s1-001` / `StudentPass123`.
3. Review home, fees, academics, report cards, timetable, announcements, and notifications.

## Offline Sync

1. Start the local desktop app.
2. Create an offline-supported record while the API is unavailable.
3. Confirm pending sync increases.
4. Reconnect to the API.
5. Click sync.
6. Review sensitive conflicts as an administrator.

Finance, payroll, budget, and inventory conflicts are never resolved with last-write-wins.
