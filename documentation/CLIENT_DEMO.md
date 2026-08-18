# Aethina Client Demo Runbook

## Start The Demo

From `C:\Users\DELL 7400\Desktop\Aethina SMS`:

```powershell
npm.cmd run db:start
npm.cmd run db:migrate:deploy
npm.cmd run db:seed
npm.cmd run demo
```

If you prefer separate terminals:

```powershell
npm.cmd run api:dev
npm.cmd run dev --workspace apps/desktop
npm.cmd run portal:dev
```

## Local URLs

```powershell
npm.cmd run demo:urls
```

Typical URLs:

- Desktop browser shell: `http://<PC-LAN-IP>:5173`
- Student/Parent Portal: `http://<PC-LAN-IP>:5174`
- API: `http://<PC-LAN-IP>:4000`

## Online Demo URLs

- Admin/Teacher URL: `https://aethina-sms-admin.vercel.app`
- Portal URL: `https://aethina-sms-portal.vercel.app`
- API URL: `https://aethina-sms-api.vercel.app`
- Neon project: `sweet-credit-41934386`

For phone testing, create `apps/portal/.env.local`:

```powershell
VITE_API_URL=http://<PC-LAN-IP>:4000
```

Restart the portal dev server after changing `.env.local`.

## Windows Firewall

Allow Node.js on Private networks only if Windows prompts.

Development ports:

- API: `4000`
- Desktop browser shell: `5173`
- Student/Parent Portal: `5174`

Do not expose these services on Public networks for the demo.

## Demo Accounts

- Admin: `admin@aethina.test` / `AdminPass123`
- Bursar: `bursar@aethina.test` / `BursarPass123`
- Teacher: `grace.otieno@aethina.test` / `TeacherPass123`
- Portal: `sat-s1-001` / `StudentPass123`
- Teacher kiosk: staff ID `TCH-001`, PIN `1234`

## Recommended Demo Flow

1. Log in as admin.
2. Show Dashboard: students, fees, approvals, low stock, payroll, risk, sync.
3. Open Students and register a new student.
4. Show generated portal credentials.
5. Open Finance, record a partial payment, and show balance/receipt.
6. Open Budgets and show an approval request.
7. Open Risk Alerts and review an example risk item.
8. Open Attendance and demonstrate staff ID/PIN check-in.
9. Open Academics and show exams, assessments, marks, and report cards.
10. Open Inventory and show current stock plus low-stock risk behavior.
11. Open Payroll and show the submitted payroll run.
12. Open Notifications and announcements.
13. Open the Student/Parent Portal on a phone at `http://<PC-LAN-IP>:5174`.
14. Log in with `sat-s1-001` / `StudentPass123`.
15. Show portal home, fees, academics, report card, timetable, announcements, and notifications.

## Offline Demo

1. Keep PostgreSQL running.
2. Open the desktop browser shell.
3. Stop the API terminal or process.
4. Create an offline-supported record such as a payment/expense/student registration.
5. Confirm the pending sync count increases.
6. Restart API: `npm.cmd run api:dev`.
7. Click Sync.
8. Open Sync Review to show duplicate protection/conflict review behavior.

## Backup

Manual SQLite backup:

```powershell
npm.cmd run backup:sqlite
```

Backups are written under:

```text
%USERPROFILE%\AethinaBackups\<timestamp>
```

Restore is intentionally manual for Phase 1. Do not overwrite a live SQLite database during a client demo without first closing the Tauri app and taking a new backup.

## Recovery

- API not reachable: restart `npm.cmd run api:dev`.
- Portal not reachable from phone: confirm phone and PC are on the same Wi-Fi, run `npm.cmd run demo:urls`, check `apps/portal/.env.local`, and allow Node.js on Private networks.
- Database not reachable: run `npm.cmd run db:start`.
- Prisma migration issue with shadow DB: use `npm.cmd run db:migrate:deploy`.
- Desktop native window issue: use browser shell `http://127.0.0.1:5173` for the demo.

## Known Phase 1 Boundaries

Student biometric attendance, native mobile apps, library, hostel, transport, procurement, ML fraud detection, cloud deployment, and multi-school tenancy are outside the Phase 1 client demo.
