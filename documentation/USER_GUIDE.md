# Satelite Secondary User Guide

Live demo:

- Admin/DOS/Teacher/Bursar: `https://aethina-sms-admin.vercel.app`
- Portal: `https://aethina-sms-portal.vercel.app`
- API: `https://aethina-sms-api.vercel.app`

## Demo Accounts

- Administrator: `admin@aethina.test` / `AdminPass123`
- Dean of Studies: `dos@satelitesecondary.test` / `DosPass123`
- Bursar: `bursar@aethina.test` / `BursarPass123`
- Class Teacher: `grace.otieno@aethina.test` / `TeacherPass123`
- Teacher: `samuel.kiprotich@aethina.test` / `TeacherPass123`
- Student portal: `sat-s1-001` / `StudentPass123`
- Teacher kiosk: staff ID `TCH-001`, PIN `1234`

## Administrator

1. Open `https://aethina-sms-admin.vercel.app`.
2. Sign in to the admin app.
3. Open `Dashboard` for school-wide oversight, finance visibility, governance approvals, risk, sync, and audit signals.
4. Open `Students` to view learner records. Student edits are intentionally owned by the Dean of Studies.
5. Open `Approvals` to approve or reject budget, expense, payroll, and payment-reversal requests.
6. Open `Audit` to inspect sensitive administrative activity.

The administrator oversees the school and governance workflow but does not own day-to-day admissions, class setup, subject allocation, grading setup, timetable creation, or report-card publishing.

## Dean Of Studies

1. Sign in as the Dean of Studies.
2. Open `School Setup` to manage academic years, terms, classes, streams, subjects, Uganda grade boundaries, subject allocations, and class-teacher assignments.
3. Open `Students` to register learners, update student details, reset portal credentials, and manage promotions.
4. Open `Timetable` and `Academics` to manage academic operations.
5. Publish report cards only after the class teacher has prepared them.

The DOS is the final academic authority for admissions, academic setup, student progression, and report-card publishing.

## Finance

1. Sign in as the bursar.
2. Open `Finance`.
3. Review fee structures, invoices, payments, receipts, expenses, and budgets.
4. Record a payment against an invoice.
5. Submit high-value expenses for approval.
6. Message fee defaulters from finance workflows as communication features are expanded.

The bursar workspace is intentionally finance-focused. It shows Dashboard, Students, Finance, Budgets, and Payroll, while hiding academic administration, school setup, inventory, sync review, and audit controls.

## Academics

1. Sign in as a teacher.
2. Open `Students` to see only learners in classes or streams assigned to you.
3. Open `Academics` to see assigned assessments and enter marks for assigned subjects only.
4. Open `Timetable` to see your teaching timetable.

Class teachers get an additional report-card preparation workflow. They prepare report cards for assigned classes or streams, then the DOS gives final approval and publishes them to the portal.

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

## Installing As An App

The online admin shell and student portal are PWA-ready:

1. Open the correct live URL in Chrome or Edge.
2. Use the browser install option from the address bar or menu.
3. Launch the installed app from the desktop, Start menu, or phone home screen.

Install the admin app for administrators, teachers, and bursars. Install the student portal for parents and students.
