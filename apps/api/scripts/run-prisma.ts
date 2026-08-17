import { spawnSync } from "node:child_process";
import { loadRootEnv } from "./env.js";

loadRootEnv();

const args = process.argv.slice(2);
const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env
});

process.exit(result.status ?? 1);
