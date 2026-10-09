import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required.`); return value; }

async function main() {
  const handoff = required("AETHINA_STAGING_HANDOFF_PATH");
  const expectedId = required("AETHINA_STAGING_HANDOFF_ID");
  if (process.env.AETHINA_STAGING_CREDENTIAL_EXTENSION_APPROVED !== "true" || process.env.VERCEL_ENV !== "preview" || process.env.AETHINA_STAGING_FIXTURE_RUNTIME !== "staging" || process.env.AETHINA_STAGING_FIXTURE_TARGET !== "aethina-sms-staging" || process.env.AETHINA_STAGING_FIXTURE_DATABASE_IDENTITY !== "aethina-sms-staging" || process.env.NEON_PROJECT_ID !== process.env.AETHINA_EXPECTED_NEON_PROJECT_ID || !isAbsolute(handoff)) throw new Error("Handoff extension requires explicit approval and exact staging identity.");
  const path = resolve(handoff); const data = JSON.parse(await readFile(path, "utf8")) as { handoffId?: string; expiresAt?: string; extensionCount?: number };
  if (data.handoffId !== expectedId || data.extensionCount) throw new Error("Handoff is not eligible for extension.");
  data.expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); data.extensionCount = 1;
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  console.log("Staging credential handoff expiry extended.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Handoff extension failed."); process.exitCode = 1; });
