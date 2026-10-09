import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { loadRootEnv } from "../scripts/env.js";

loadRootEnv();

describe("attendance correction cross-school isolation", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let schoolAId: string;
  let schoolBId: string;
  let headTeacherAId: string;
  let headTeacherBId: string;
  let correctionId: string;
  let headTeacherAToken: string;
  let headTeacherBToken: string;
  const suffix = crypto.randomUUID();
  const headTeacherAPassword = `HeadTeacherA-${suffix}`;
  const headTeacherBPassword = `HeadTeacherB-${suffix}`;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = app.get(PrismaService);

    const permission = await prisma.permission.upsert({
      where: { key: "attendance.correction.review" },
      update: {},
      create: { key: "attendance.correction.review", description: "Attendance correction review" }
    });

    const schoolA = await prisma.school.create({ data: { name: "Cross-school Test A", code: `XSA-${suffix.slice(0, 8)}` } });
    const schoolB = await prisma.school.create({ data: { name: "Cross-school Test B", code: `XSB-${suffix.slice(0, 8)}` } });
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    const [roleA, roleB] = await Promise.all([
      prisma.role.create({ data: { schoolId: schoolAId, name: "Head Teacher", description: "Disposable test role" } }),
      prisma.role.create({ data: { schoolId: schoolBId, name: "Head Teacher", description: "Disposable test role" } })
    ]);
    await prisma.rolePermission.createMany({ data: [
      { roleId: roleA.id, permissionId: permission.id },
      { roleId: roleB.id, permissionId: permission.id }
    ] });

    const [headA, headB] = await Promise.all([
      prisma.user.create({ data: { schoolId: schoolAId, email: `cross-head-a-${suffix}@example.test`, displayName: "Cross School Head A", passwordHash: `dev:${headTeacherAPassword}` } }),
      prisma.user.create({ data: { schoolId: schoolBId, email: `cross-head-b-${suffix}@example.test`, displayName: "Cross School Head B", passwordHash: `dev:${headTeacherBPassword}` } })
    ]);
    headTeacherAId = headA.id;
    headTeacherBId = headB.id;
    await prisma.userRole.createMany({ data: [
      { userId: headTeacherAId, roleId: roleA.id },
      { userId: headTeacherBId, roleId: roleB.id }
    ] });

    const teacherB = await prisma.teacher.create({
      data: { schoolId: schoolBId, userId: headTeacherBId, staffId: `XSB-${suffix.slice(0, 8)}`, firstName: "Cross", lastName: "Teacher", pinHash: "dev:1234" }
    });
    const attendance = await prisma.teacherAttendance.create({
      data: {
        schoolId: schoolBId,
        teacherId: teacherB.id,
        attendanceDate: new Date("2026-09-15T00:00:00.000Z"),
        checkInAt: new Date("2026-09-15T08:20:00.000Z"),
        status: "CORRECTION_REQUESTED",
        approvalStatus: "PENDING",
        correctionRequestedBy: teacherB.id,
        correctionReason: "Cross-school isolation test correction.",
        requestedCheckInAt: new Date("2026-09-15T08:00:00.000Z")
      }
    });
    correctionId = attendance.id;

    headTeacherAToken = (await login(`cross-head-a-${suffix}@example.test`, headTeacherAPassword)).accessToken;
    headTeacherBToken = (await login(`cross-head-b-${suffix}@example.test`, headTeacherBPassword)).accessToken;
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.auditLog.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
      await prisma.teacherAttendance.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
      await prisma.teacher.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
      await prisma.userRole.deleteMany({ where: { userId: { in: [headTeacherAId, headTeacherBId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [headTeacherAId, headTeacherBId] } } });
      await prisma.rolePermission.deleteMany({ where: { role: { schoolId: { in: [schoolAId, schoolBId] } } } });
      await prisma.role.deleteMany({ where: { schoolId: { in: [schoolAId, schoolBId] } } });
      await prisma.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } });
    }
    await app?.close();
  });

  it("blocks a Head Teacher from deciding another school's correction while preserving it for the owning school", async () => {
    const queueA = await request("/teacher-attendance/correction-requests", "GET", undefined, headTeacherAToken);
    expect(queueA.status).toBe(200);
    expect((await queueA.json()).some((row: { id: string }) => row.id === correctionId)).toBe(false);

    const crossApprove = await request(`/teacher-attendance/${correctionId}/approve-correction`, "POST", {}, headTeacherAToken);
    const crossReject = await request(`/teacher-attendance/${correctionId}/reject-correction`, "POST", { reason: "Cross-school attempt" }, headTeacherAToken);
    expect(crossApprove.status).toBe(404);
    expect(crossReject.status).toBe(404);

    const unchanged = await prisma.teacherAttendance.findUniqueOrThrow({ where: { id: correctionId } });
    expect(unchanged.approvalStatus).toBe("PENDING");
    expect(unchanged.checkInAt?.toISOString()).toBe("2026-09-15T08:20:00.000Z");
    expect(unchanged.requestedCheckInAt?.toISOString()).toBe("2026-09-15T08:00:00.000Z");
    await expect(prisma.auditLog.count({ where: { entityId: correctionId, actorId: headTeacherAId, action: "TEACHER_ATTENDANCE_CORRECTION_APPROVED" } })).resolves.toBe(0);
    await expect(prisma.auditLog.count({ where: { entityId: correctionId, actorId: headTeacherAId, action: "TEACHER_ATTENDANCE_CORRECTION_REJECTED" } })).resolves.toBe(0);

    const queueB = await request("/teacher-attendance/correction-requests", "GET", undefined, headTeacherBToken);
    expect(queueB.status).toBe(200);
    expect((await queueB.json()).some((row: { id: string }) => row.id === correctionId)).toBe(true);

    const approved = await request(`/teacher-attendance/${correctionId}/approve-correction`, "POST", {}, headTeacherBToken);
    expect(approved.status).toBe(201);
    const decision = await prisma.teacherAttendance.findUniqueOrThrow({ where: { id: correctionId } });
    expect(decision.approvalStatus).toBe("APPROVED");
    expect(decision.approvedBy).toBe(headTeacherBId);
    await expect(prisma.auditLog.count({ where: { entityId: correctionId, actorId: headTeacherBId, action: "TEACHER_ATTENDANCE_CORRECTION_APPROVED" } })).resolves.toBe(1);
  }, 60_000);

  async function login(email: string, password: string) {
    const response = await request("/auth/login", "POST", { email, password, deviceId: "00000000-0000-4000-8000-000000000001" });
    expect(response.status).toBe(201);
    return response.json() as Promise<{ accessToken: string }>;
  }

  function request(path: string, method: "GET" | "POST", body?: unknown, token?: string) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }
});
