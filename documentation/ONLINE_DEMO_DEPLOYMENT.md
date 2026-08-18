# Aethina Online Demo Deployment

This guide prepares a safe online demo using Vercel and Neon while preserving the local offline-first architecture.

## Architecture

Local development remains unchanged:

```text
Desktop/Tauri -> SQLite -> local NestJS API -> local PostgreSQL Docker
Portal -> local NestJS API -> local PostgreSQL Docker
```

Online demo:

```text
Admin/Teacher shell on Vercel -> Vercel API -> Neon PostgreSQL
Portal on Vercel -> NestJS API on Vercel -> Neon PostgreSQL
Desktop demo mode -> SQLite -> Vercel API -> Neon PostgreSQL
```

## Neon

A separate Neon demo project was created:

- Project ID: `sweet-credit-41934386`
- Branch ID: `br-withered-night-av60pe3d`
- Database: `neondb`
- Role: `neondb_owner`

Do not commit the Neon connection string. Store it only as a Vercel environment variable.

Use:

- `DATABASE_URL`: Neon pooled connection string for Vercel runtime.
- `DIRECT_DATABASE_URL`: Neon direct connection string if you choose to add one for migration workflows.

Migrations were applied with:

```powershell
npx.cmd prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

Demo seed requires:

```powershell
NODE_ENV=production
AETHINA_DEMO_SEED=true
DATABASE_URL=<NEON_DATABASE_URL>
npm.cmd run prisma:seed --workspace apps/api
```

## Vercel Projects

Three Vercel projects have been created from this monorepo:

- API: `aethina-sms-api`
- Portal: `aethina-sms-portal`
- Admin/Teacher shell: `aethina-sms-admin`

Stable production URLs:

- API: `https://aethina-sms-api.vercel.app`
- Portal: `https://aethina-sms-portal.vercel.app`
- Admin/Teacher: `https://aethina-sms-admin.vercel.app`

### Admin/Teacher Project

- Project: `aethina-sms-admin`
- Root Directory: repository root
- Framework Preset: Vite
- Build Command: `npm run build --workspace packages/shared-types && npm run build --workspace packages/validation && npm run build --workspace apps/desktop`
- Output Directory: `apps/desktop/dist`
- Config file: `vercel.admin.json`

Environment variables:

- `VITE_API_URL`

Set `VITE_API_URL` to `https://aethina-sms-api.vercel.app`.

### Portal Project

- Project: `aethina-sms-portal`
- Root Directory: repository root
- Framework Preset: Vite
- Build Command: `npm run build --workspace packages/shared-types && npm run build --workspace packages/validation && npm run build --workspace apps/portal`
- Output Directory: `apps/portal/dist`
- Config file: `vercel.portal.json`

Environment variables:

- `VITE_API_URL`

Set `VITE_API_URL` to `https://aethina-sms-api.vercel.app`.

### API Project

- Project: `aethina-sms-api`
- Root Directory: repository root
- Framework Preset: Other
- Build Command: `npm run build --workspace packages/shared-types && npm run build --workspace packages/validation && npm run prisma:generate --workspace apps/api && npm run build --workspace apps/api`
- Config file: `vercel.api.json`

Environment variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `PORTAL_URL`
- `SYNC_BATCH_SIZE`
- `NODE_ENV`

Recommended values:

```text
NODE_ENV=production
SYNC_BATCH_SIZE=100
CORS_ORIGINS=https://aethina-sms-portal.vercel.app,https://aethina-sms-admin.vercel.app
PORTAL_URL=https://aethina-sms-portal.vercel.app
```

Do not set `API_HOST` on Vercel. It is only for local server startup.

## API Health Check

After deployment:

```text
GET https://aethina-sms-api.vercel.app/health
```

Expected:

```json
{
  "status": "ok",
  "database": "ok"
}
```

## SPA Refresh Support

`vercel.portal.json` and `vercel.admin.json` rewrite all routes to `index.html`, so SPA routes should open without a Vercel 404. Portal routes include:

- `/`
- `/login`
- `/academics`
- `/finance`
- `/timetable`
- `/announcements`
- `/notifications`
- `/profile`

The current portal is state-driven rather than React Router based, so those paths render the portal shell.

## Desktop Demo Mode

Local mode:

```text
apps/desktop/.env.local
VITE_API_URL=http://localhost:4000
```

Cloud demo mode:

```text
apps/desktop/.env.local
VITE_API_URL=https://aethina-sms-api.vercel.app
```

The desktop still uses local SQLite. Only synchronization/API calls switch to the hosted API.

## Serverless Compatibility Notes

- No persistent in-memory application state is required.
- Auth uses bearer JWTs, not server sessions.
- Notifications are database-backed and processed through explicit API calls.
- Uploaded photos/documents are currently metadata/URL fields only; durable file upload storage is not part of the online demo.
- SQLite remains local to Tauri and is not replaced by Neon.
- Vercel function memory must not be used for durable queue state.

## Deployment Status

Production deployment is complete.

- API deployment: ready, `GET /health` returns `status: ok` and `database: ok`.
- Portal deployment: ready, root page returns HTTP 200.
- Admin/Teacher deployment: ready, root page returns HTTP 200.
- Admin-to-API CORS preflight: HTTP 204 with `Access-Control-Allow-Origin: https://aethina-sms-admin.vercel.app`.
- Production admin login and portal login were verified against the hosted API.

Deployment-specific fixes:

- `.vercelignore` excludes local dependencies, Tauri build artifacts, SQLite files, logs, and secrets.
- Root Vercel configs deploy from the monorepo root so shared workspace packages are available.
- The serverless API entrypoint imports the compiled Nest output from `apps/api/dist` to avoid decorator transpilation issues in Vercel's function wrapper.
- `apps/api/scripts/env.ts` tolerates missing local `.env` files when Vercel injects environment variables.

## Verification Commands

```powershell
npm.cmd run test
npm.cmd run build
npm.cmd run build:vercel:api
npm.cmd run build:vercel:portal
npm.cmd run build --workspace apps/desktop
npx.cmd prisma validate --schema apps/api/prisma/schema.prisma
npx.cmd prisma migrate status --schema apps/api/prisma/schema.prisma
cargo check
```
