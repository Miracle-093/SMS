import { PrismaClient } from "@prisma/client";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const prisma = new PrismaClient();
const qaSchoolCode = "AETHINA-QA-STAGING";
const qaDomain = "aethina.invalid";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function hash(secret: string): string {
  const salt = randomBytes(16).toString("base64url");
  const digest = pbkdf2Sync(secret, salt, 210_000, 32, "sha256").toString("base64url");
  return `pbkdf2$210000$${salt}$${digest}`;
}

function password(): string { return `${randomBytes(24).toString("base64url")}Qa!9`; }
function pin(): string { return String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)); }

function assertTarget(): string {
  const databaseUrl = required("DATABASE_URL");
  const actualProject = required("NEON_PROJECT_ID");
  const expectedProject = required("AETHINA_EXPECTED_NEON_PROJECT_ID");
  const handoff = required("AETHINA_STAGING_HANDOFF_PATH");
  const resolvedHandoff = resolve(handoff);
  const repository = resolve(process.cwd());
  let host = "";
  try { host = new URL(databaseUrl).hostname.toLowerCase(); } catch { throw new Error("DATABASE_URL must be a valid staging PostgreSQL URL."); }
  if (
    process.env.AETHINA_STAGING_CREDENTIAL_RECOVERY_APPROVED !== "true" ||
    process.env.AETHINA_STAGING_FIXTURE_RUNTIME !== "staging" ||
    process.env.AETHINA_STAGING_FIXTURE_TARGET !== "aethina-sms-staging" ||
    process.env.AETHINA_STAGING_FIXTURE_DATABASE_IDENTITY !== "aethina-sms-staging" ||
    process.env.AETHINA_STAGING_QA_SCHOOL_CODE !== qaSchoolCode ||
    process.env.VERCEL_ENV !== "preview" ||
    process.env.NODE_ENV === "production" ||
    actualProject !== expectedProject ||
    !host.endsWith(".neon.tech") ||
    /production/i.test(databaseUrl) ||
    !isAbsolute(handoff) ||
    resolvedHandoff.toLowerCase().startsWith(repository.toLowerCase())
  ) throw new Error("Staging credential recovery requires the exact QA staging target, approval marker, expected Neon identity, and external handoff path.");
  return resolvedHandoff;
}

async function main() {
  const handoff = assertTarget();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 4 * 60 * 60 * 1000);
  const handoffId = randomUUID();
  const credentials = { administrator: password(), headTeacher: password(), dos: password(), bursar: password(), teacher: password(), classTeacher: password(), kioskTeacher: password(), portal: password(), kioskPin: pin() };
  const identities = [
    ["administrator", "qa-admin"], ["headTeacher", "qa-head"], ["dos", "qa-dos"], ["bursar", "qa-bursar"],
    ["teacher", "qa-teacher"], ["classTeacher", "qa-class-teacher"], ["kioskTeacher", "qa-kiosk"]
  ] as const;

  const handoffData = await prisma.$transaction(async (tx) => {
    const schools = await tx.school.findMany({ select: { id: true, code: true } });
    if (schools.length !== 1 || schools[0]?.code !== qaSchoolCode) throw new Error("Credential recovery refuses a non-QA or multi-tenant database.");
    const school = schools[0];
    if (await tx.user.count({ where: { schoolId: { not: school.id } } })) throw new Error("Credential recovery refuses users outside the QA school.");
    const users = await Promise.all(identities.map(async ([key, local]) => {
      const user = await tx.user.findUnique({ where: { email: `${local}@${qaDomain}` } });
      if (!user || user.schoolId !== school.id) throw new Error("Credential recovery requires each existing QA staff identity in the QA school.");
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: hash(credentials[key]), mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null } });
      return [key, user.email] as const;
    }));
    const portal = await tx.studentPortalCredential.findUnique({ where: { username: "qa-portal-student" }, include: { student: true } });
    if (!portal || portal.student.schoolId !== school.id) throw new Error("Credential recovery requires the existing QA portal identity.");
    await tx.studentPortalCredential.update({ where: { id: portal.id }, data: { passwordHash: hash(credentials.portal), mustReset: false, failedLoginAttempts: 0, lockedUntil: null } });
    const kiosk = await tx.teacher.findUnique({ where: { staffId: "QA-KIOSK-01" } });
    if (!kiosk || kiosk.schoolId !== school.id) throw new Error("Credential recovery requires the existing QA kiosk teacher.");
    await tx.teacher.update({ where: { id: kiosk.id }, data: { pinHash: hash(credentials.kioskPin) } });
    return { schoolId: school.id, staff: Object.fromEntries(users), portalUsername: portal.username, kioskStaffId: kiosk.staffId };
  }, { maxWait: 10_000, timeout: 60_000 });

  await writeFile(handoff, JSON.stringify({ handoffId, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), permissions: "owner-read-write requested", fixture: "Aethina staging QA only", schoolCode: qaSchoolCode, schoolId: handoffData.schoolId, users: {
    administrator: { email: handoffData.staff.administrator, password: credentials.administrator }, headTeacher: { email: handoffData.staff.headTeacher, password: credentials.headTeacher }, dos: { email: handoffData.staff.dos, password: credentials.dos }, bursar: { email: handoffData.staff.bursar, password: credentials.bursar }, teacher: { email: handoffData.staff.teacher, password: credentials.teacher }, classTeacher: { email: handoffData.staff.classTeacher, password: credentials.classTeacher }, kioskTeacher: { email: handoffData.staff.kioskTeacher, password: credentials.kioskTeacher, staffId: handoffData.kioskStaffId, pin: credentials.kioskPin }, portal: { username: handoffData.portalUsername, password: credentials.portal }
  } }, null, 2), { mode: 0o600 });
  console.log("Staging QA credentials rotated. Credentials were written only to the configured external handoff path.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Staging credential recovery failed."); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
