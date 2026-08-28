# Aethina SMS Phase One Operations Runbook

Release target: Aethina SMS Phase One - Client Acceptance and Pilot Release.

This runbook is for the pilot environment only. Do not run destructive commands against hosted or production data without explicit approval and a fresh backup.

## Daily Startup Check

1. Confirm the API health endpoint returns OK.
2. Confirm the administrator app and student portal load.
3. Log in with one staff role and one portal role.
4. Check dashboard summary, finance overview, academics, and portal home.
5. Confirm no unexpected open sync conflicts or failed migrations.

## Backup Procedure

Local disposable or pilot database:

```powershell
docker exec aethina-postgres pg_dump -U aethina_dev -d aethina_sms_dev -f /tmp/aethina_sms_backup.sql
```

Hosted database:

1. Use the hosting provider's managed backup first.
2. Take a manual `pg_dump` using a direct database connection only after approval.
3. Record the backup timestamp, database name, commit SHA, and operator.
4. Store the backup outside the repository.

Never commit `.env`, database dumps, SQLite files, production credentials, or backup archives.

## Restore Procedure

Only rehearse restores on disposable local databases.

```powershell
docker exec aethina-postgres createdb -U aethina_dev aethina_sms_restore_check
docker exec aethina-postgres psql -U aethina_dev -d aethina_sms_restore_check -f /tmp/aethina_sms_backup.sql
```

After restore:

1. Run a row-count check on schools, users, students, invoices, payments, marks, and audit logs.
2. Start the API against the restored database.
3. Run `npm.cmd run acceptance:phase1` only if the restored database is disposable.
4. Destroy the restore-check database after recording evidence.

Latest local rehearsal evidence:

- Date: 2026-08-27
- Source database: `aethina_sms_dev`
- Backup path inside local container: `/tmp/aethina_phase1_rehearsal_20260827.sql`
- Disposable restore database: `aethina_sms_restore_rehearsal_20260827`
- Restore result: passed
- Restored table evidence from `pg_class`: `School=1`, `User=11`, `Student=68`, `StudentInvoice=559`, `Payment=25`, `Mark=186`, `AuditLog=355`

## Migration Procedure

1. Review migration SQL before running it.
2. Take a backup.
3. Apply checked-in migrations:

```powershell
npx.cmd prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

4. Run:

```powershell
npm.cmd run test
npm.cmd run build
npm.cmd run build:vercel:api
npm.cmd run offline:smoke
```

5. Record the commit SHA and migration output.

## Rollback Procedure

Phase One rollback is backup restore plus redeploying the previous known-good build.

1. Stop traffic or put the pilot in maintenance mode.
2. Record the failed version, error, and timestamp.
3. Redeploy the previous known-good frontend/API build.
4. Restore the last verified backup if data was changed incorrectly.
5. Run health checks and the role smoke tests before reopening access.

## Deployment Checklist

1. Confirm `.env.example` has placeholders only.
2. Confirm hosted API environment variables are set: `DATABASE_URL`, `JWT_SECRET`, and allowed frontend origins.
3. Confirm admin and portal frontends point to the hosted API URL.
4. Run the complete validation suite locally.
5. Verify hosted `/health` without mutating hosted data.
6. Tag or record the commit SHA in `documentation/FINAL_RELEASE_MANIFEST.md`.
7. Save acceptance evidence under `output/acceptance`.

## Version Recording

For every pilot build record:

- Date and operator.
- Git branch and commit SHA.
- API URL, admin URL, portal URL.
- Migration status.
- Validation commands and results.
- Known limitations accepted for pilot.

## Feedback And Issue Reporting

Use one shared pilot feedback log during the client run.

For each issue capture:

- Reporter and role.
- Exact screen and workflow.
- Expected result.
- Actual result.
- Screenshot or receipt/invoice/report number if relevant.
- Severity: P0, P1, or P2.
- Whether data correction is required.

P0 issues stop pilot use until triaged. P1 issues are reviewed daily during the pilot. P2 issues are batched for the post-pilot backlog.
