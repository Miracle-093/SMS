# Production Database Recovery Incident — 2026-10-07

## Scope

The prior Aethina production database was no longer available. The project owner confirmed it contained no client data requiring restoration. This recovery creates a new empty production database and does not deploy application code.

## Incident timeline

1. The historic online-demo documentation identified the earlier Neon project as `sweet-credit-41934386`.
2. The current Neon organization contained no such project. The exact database-deletion action, actor, and timestamp are not available in the repository, Vercel project metadata, or current Neon project list.
3. During staging isolation, the following command was run:

   ```powershell
   npx.cmd vercel env rm DATABASE_URL preview --yes --project aethina-sms-api --scope aethina
   ```

   It was considered authorized because the requested change was to remove Preview access while preserve Production access. The Vercel variable had one shared record scoped to both Production and Preview; the CLI removed the entire record instead of splitting its targets. This action removed the Vercel configuration reference. It did **not** delete a Neon database.
4. A replacement `aethina-sms-production` Neon resource was created in Frankfurt on Neon Free and attached only to `aethina-sms-api` Production. The previously-created `aethina-sms-staging` resource is attached only to API Preview.

## Failed safety check

The workflow did not first prove that Vercel could detach Preview from a multi-target secret without deleting the Production target, and it did not preserve a recoverable configuration record before the change. Future target changes must be made only after a target-level dry run or provider-supported edit path has been verified.

## Recovery and backup status

- Neon point-in-time recovery is available on its free tier. It is the recovery mechanism for the newly created production resource.
- Snapshots are a separate early-access feature. No snapshot was created because its storage and retention cost were not established.
- No provider deletion-protection setting was exposed through the Vercel Marketplace resource or Neon CLI available in this workspace.
- Recovery of the absent historic Neon project requires Neon support if the provider retains it; the Vercel Activity Log records variable deletion events but does not retain secret values.

## Controls added

1. `apps/api/scripts/reset-dev-db.ts` now permits a destructive reset only for the exact local `aethina_sms_dev` database and requires an explicit matching confirmation variable.
2. `documentation/OPERATIONS_RUNBOOK.md` now requires explicit written approval naming the exact database before any delete, reset, destructive seed, `prisma db push`, or `DROP DATABASE` operation.
3. Production bootstrap is isolated in `apps/api/prisma/bootstrap-production.ts`. It requires an explicit bootstrap flag, exact Production runtime markers, the `aethina-sms-production` target name, and a matching expected Neon project identity. It also rejects non-empty databases, demo identifiers, and weak temporary passwords.

## Production rollout after this checkpoint

1. Supply the real school and owner details through secure Production environment variables and execute the guarded one-time bootstrap.
2. Verify the administrator changes the temporary password.
3. Configure separate Production and Preview JWT variables and preview CORS origins.
4. Deploy and health-check the API, then configure and deploy the admin and portal frontends.
5. Record a Neon recovery point before future schema changes; test restoration on a separate branch before a production migration.
