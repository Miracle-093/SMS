import { readFile, rm } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required.`); return value; }

async function main() {
  const handoff = required("AETHINA_STAGING_HANDOFF_PATH");
  const expectedId = required("AETHINA_STAGING_HANDOFF_ID");
  const actualProject = required("NEON_PROJECT_ID");
  const expectedProject = required("AETHINA_EXPECTED_NEON_PROJECT_ID");
  const reason = required("AETHINA_STAGING_CREDENTIAL_CLEANUP_REASON");
  if (process.env.AETHINA_STAGING_CREDENTIAL_CLEANUP_APPROVED !== "true" || process.env.VERCEL_ENV !== "preview" || process.env.AETHINA_STAGING_FIXTURE_RUNTIME !== "staging" || process.env.AETHINA_STAGING_FIXTURE_TARGET !== "aethina-sms-staging" || process.env.AETHINA_STAGING_FIXTURE_DATABASE_IDENTITY !== "aethina-sms-staging" || actualProject !== expectedProject || !isAbsolute(handoff) || /production/i.test(handoff)) throw new Error("Staging credential handoff cleanup requires explicit approval and the exact staging target.");
  const metadata = JSON.parse(await readFile(resolve(handoff), "utf8")) as { handoffId?: string; expiresAt?: string };
  if (metadata.handoffId !== expectedId) throw new Error("Handoff identifier does not match.");
  if (reason !== "completed" && !(reason === "expired" && metadata.expiresAt && new Date(metadata.expiresAt) <= new Date())) throw new Error("Cleanup requires completed testing or a verified expired handoff.");
  await rm(resolve(handoff));
  console.log("Staging credential handoff deleted.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Handoff cleanup failed."); process.exitCode = 1; });
