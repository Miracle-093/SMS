import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "./env.js";

loadRootEnv();

if (process.env.NODE_ENV !== "development") {
  throw new Error("Refusing to reset database because NODE_ENV is not explicitly development.");
}

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes("aethina_sms_dev")) {
  throw new Error("Refusing to reset database because DATABASE_URL does not look like the local development database.");
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
