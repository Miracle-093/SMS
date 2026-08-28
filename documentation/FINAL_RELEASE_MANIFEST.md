# Final Release Manifest

Release target: Aethina SMS Phase One - Client Acceptance and Pilot Release.

## Version

- Release date: 2026-08-27
- Git branch: `main`
- Git commit SHA at packaging checkpoint: `346ede5f5b318b1e53d2963e1123825a00968110`
- Acceptance evidence: `output/acceptance/phase1-acceptance-2026-08-27T17-04-25-327Z.md`
- Client report PDF: `output/pdf/aethina-phase-one-client-acceptance-report.pdf`

## URLs

- Hosted API: `https://aethina-sms-api.vercel.app`
- Hosted Admin/Staff app: `https://aethina-sms-admin.vercel.app`
- Hosted Student/Parent portal: `https://aethina-sms-portal.vercel.app`
- Local API: `http://localhost:4000`
- Local Admin/Staff app: `http://localhost:5173`
- Local Student/Parent portal: `http://localhost:5174`

## Validation Status

Latest known passing baseline before final packaging:

- `npm.cmd run test`
- `npm.cmd run build`
- `npm.cmd run build:vercel:api`
- `npm.cmd run offline:smoke`
- `npm.cmd run acceptance:phase1`

Additional release-preparation checks:

- Desktop workspace build after print-output controls: passed
- Portal workspace build after print-output controls: passed
- Local disposable PostgreSQL backup/restore rehearsal: passed
- Final acceptance execution after release-preparation changes: 14/14 passed
- Portal mobile browser check at 390x844: login, finance print, academics print, no horizontal overflow
- Staff desktop browser check at 1366x768: administrator finance print and DOS academic print controls visible, no horizontal overflow
- Staff mobile browser check at 390x844: mobile shell and section selector visible, no horizontal overflow
- Hosted read-only checks: API `/health` returned `status=ok` and `database=ok`; hosted admin and portal returned HTTP 200
- Frontend/UI polish implementation: desktop role persona precedence, first-launch window width, kiosk failure copy, aria-live notices, keyboard student row selection, portal semantic output tables, portal print identity headers, portal retry states for timetable/announcements/notifications, and service-worker asset runtime caching
- Desktop installer rebuild after UI polish: MSI and NSIS generated successfully on 2026-08-27

Re-run all commands after any release change and update this section with timestamps.

## Delivery Artifacts

- Phase One client acceptance report.
- Completed acceptance evidence.
- Role-based user guide.
- Administrator onboarding guide.
- Known limitations and deferred items.
- Demo script.
- Demo account and role handoff template.
- Deployment and recovery notes.
- Support and feedback procedure.
- Desktop MSI: `apps/desktop/src-tauri/target/release/bundle/msi/Aethina SMS_0.1.0_x64_en-US.msi`
- Desktop NSIS installer: `apps/desktop/src-tauri/target/release/bundle/nsis/Aethina SMS_0.1.0_x64-setup.exe`

## Required Setup

- PostgreSQL database with checked-in Prisma migrations applied.
- API `DATABASE_URL` and `JWT_SECRET`.
- Admin/portal frontend API URL configuration.
- Fictional pilot seed data only unless real onboarding is explicitly approved.
- Secure password handoff outside the repository.
