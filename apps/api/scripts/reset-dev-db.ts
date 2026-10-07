import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "./env.js";

loadRootEnv();

if (process.env.NODE_ENV !== "development") {
  throw new Error("Refusing to reset database because NODE_ENV is not explicitly development.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("Refusing to reset database because DATABASE_URL is unavailable.");
}

const databaseUrl = new URL(process.env.DATABASE_URL);
const isLocalDevelopmentDatabase = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)
  && databaseUrl.pathname === "/aethina_sms_dev";
if (!isLocalDevelopmentDatabase) {
  throw new Error("Refusing to reset database because it is not the exact local aethina_sms_dev database.");
}

if (process.env.AETHINA_CONFIRM_DESTRUCTIVE_RESET !== "aethina_sms_dev") {
  throw new Error("Refusing to reset database without AETHINA_CONFIRM_DESTRUCTIVE_RESET=aethina_sms_dev and explicit approval naming that database.");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const backupDir = resolve(root, "backups");
mkdirSync(backupDir, { recursive: true });

const backupFile = resolve(backupDir, `dev-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
console.log(`Creating development backup before reset: ${backupFile}`);

try {
  execFileSync("pg_dump", [process.env.DATABASE_URL, "--file", backupFile], { stdio: "inherit" });
} catch {
  console.warn("pg_dump was not available or backup failed. Continuing only because this command is development-only.");
}

console.log("Resetting the development database with Prisma migrations and seed data.");
execFileSync("npx", ["prisma", "migrate", "reset", "--force"], { stdio: "inherit", cwd: resolve(root, "apps/api") });
