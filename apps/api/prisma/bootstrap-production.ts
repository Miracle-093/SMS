import { PrismaClient } from "@prisma/client";
import { randomBytes, pbkdf2Sync } from "node:crypto";

const prisma = new PrismaClient();

const permissionKeys = [
  "auth.login", "users.manage", "school-config.manage", "admissions.manage", "academic-setup.manage",
  "teacher-subjects.manage", "class-teachers.manage", "students.read", "students.manage", "students.promote",
  "portal-credentials.reset", "audit.read", "dashboard.read", "finance.read", "finance.manage", "budget.manage",
  "approval.review", "risk.review", "academics.read", "academics.manage", "marks.entry", "marks.review",
  "results.approve", "report-cards.prepare", "report-cards.publish", "timetable.manage", "attendance.manage",
  "sync.review", "inventory.manage", "payroll.read", "payroll.manage", "notifications.manage",
  "announcements.manage", "portal.access"
] as const;

const roles: Record<string, readonly string[]> = {
  "Super Administrator": permissionKeys,
  "School Administrator": ["auth.login", "users.manage", "dashboard.read", "school-config.manage", "students.read", "audit.read", "approval.review", "risk.review", "finance.read", "budget.manage", "inventory.manage", "payroll.read", "announcements.manage", "sync.review"],
  "Head Teacher": ["auth.login", "dashboard.read", "students.read", "audit.read", "attendance.manage", "approval.review", "academics.read", "marks.review", "announcements.manage"],
  "Dean of Studies": ["auth.login", "dashboard.read", "admissions.manage", "academic-setup.manage", "teacher-subjects.manage", "class-teachers.manage", "students.read", "students.manage", "students.promote", "portal-credentials.reset", "academics.read", "academics.manage", "marks.review", "results.approve", "report-cards.publish", "timetable.manage", "announcements.manage"],
  "Lower School Dean of Studies": ["auth.login", "dashboard.read", "admissions.manage", "academic-setup.manage", "teacher-subjects.manage", "class-teachers.manage", "students.read", "students.manage", "students.promote", "portal-credentials.reset", "academics.read", "academics.manage", "marks.review", "results.approve", "report-cards.publish", "timetable.manage", "announcements.manage"],
  "Middle School Dean of Studies": ["auth.login", "dashboard.read", "admissions.manage", "academic-setup.manage", "teacher-subjects.manage", "class-teachers.manage", "students.read", "students.manage", "students.promote", "portal-credentials.reset", "academics.read", "academics.manage", "marks.review", "results.approve", "report-cards.publish", "timetable.manage", "announcements.manage"],
  "Upper School Dean of Studies": ["auth.login", "dashboard.read", "admissions.manage", "academic-setup.manage", "teacher-subjects.manage", "class-teachers.manage", "students.read", "students.manage", "students.promote", "portal-credentials.reset", "academics.read", "academics.manage", "marks.review", "results.approve", "report-cards.publish", "timetable.manage", "announcements.manage"],
  "Class Teacher": ["auth.login", "dashboard.read", "students.read", "academics.read", "marks.entry", "marks.review", "report-cards.prepare", "attendance.manage"],
  "Teacher": ["auth.login", "dashboard.read", "students.read", "attendance.manage", "academics.read", "marks.entry"],
  "Bursar/Accountant": ["auth.login", "dashboard.read", "students.read", "finance.read", "finance.manage", "budget.manage", "payroll.read", "payroll.manage"],
  "Receptionist": ["auth.login", "students.read", "students.manage", "portal-credentials.reset"],
  "Student/Parent Portal User": ["auth.login", "portal.access"]
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("base64url");
  return `pbkdf2$210000$${salt}$${hash}`;
}

async function main() {
  const expectedNeonProjectId = required("AETHINA_EXPECTED_NEON_PROJECT_ID");
  const actualNeonProjectId = required("NEON_PROJECT_ID");

  if (process.env.AETHINA_PRODUCTION_BOOTSTRAP !== "true") {
    throw new Error("Set AETHINA_PRODUCTION_BOOTSTRAP=true to run this one-time production bootstrap.");
  }
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV !== "production" ||
    process.env.AETHINA_BOOTSTRAP_TARGET !== "aethina-sms-production" ||
    actualNeonProjectId !== expectedNeonProjectId
  ) {
    throw new Error("Production bootstrap requires the exact aethina-sms-production Production target and expected Neon project identity.");
  }

  const schoolName = required("AETHINA_BOOTSTRAP_SCHOOL_NAME");
  const schoolCode = required("AETHINA_BOOTSTRAP_SCHOOL_CODE").toUpperCase();
  const adminName = required("AETHINA_BOOTSTRAP_ADMIN_NAME");
  const adminEmail = required("AETHINA_BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const temporaryPassword = required("AETHINA_BOOTSTRAP_ADMIN_PASSWORD");

  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(schoolCode) || schoolCode.includes("DEMO")) {
    throw new Error("AETHINA_BOOTSTRAP_SCHOOL_CODE must be a non-demo uppercase code of 3-32 letters, digits, or hyphens.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminEmail.endsWith(".test")) {
    throw new Error("AETHINA_BOOTSTRAP_ADMIN_EMAIL must be a real, non-demo email address.");
  }
  if (temporaryPassword.length < 16 || !/[a-z]/.test(temporaryPassword) || !/[A-Z]/.test(temporaryPassword) || !/\d/.test(temporaryPassword) || !/[^A-Za-z0-9]/.test(temporaryPassword)) {
    throw new Error("AETHINA_BOOTSTRAP_ADMIN_PASSWORD must be at least 16 characters and contain upper-case, lower-case, digit, and symbol characters.");
  }

  const [schoolCount, userCount] = await Promise.all([prisma.school.count(), prisma.user.count()]);
  if (schoolCount !== 0 || userCount !== 0) {
    throw new Error("Production bootstrap only runs against an empty application database.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.permission.createMany({ data: permissionKeys.map((key) => ({ key, description: `Allows ${key}` })), skipDuplicates: true });
    const permissions = await tx.permission.findMany({ where: { key: { in: [...permissionKeys] } } });
    const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

    const school = await tx.school.create({ data: { name: schoolName, code: schoolCode, isActive: true } });
    const roleByName = new Map<string, string>();
    for (const [name, keys] of Object.entries(roles)) {
      const role = await tx.role.create({ data: { schoolId: school.id, name, description: `${name} default role` } });
      roleByName.set(name, role.id);
      await tx.rolePermission.createMany({
        data: keys.map((key) => ({ roleId: role.id, permissionId: permissionByKey.get(key)! }))
      });
    }

    const administrator = await tx.user.create({
      data: {
        schoolId: school.id,
        email: adminEmail,
        displayName: adminName,
        passwordHash: hashPassword(temporaryPassword),
        isActive: true,
        mustChangePassword: true
      }
    });
    await tx.userRole.create({ data: { userId: administrator.id, roleId: roleByName.get("School Administrator")! } });
  });

  console.log("Production bootstrap completed. The administrator must change the temporary password at first login.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Production bootstrap failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
