import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { loadRootEnv } from "../scripts/env.js";

loadRootEnv();

describe("attendance correction terminal states", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let schoolId: string;
  let reviewerId: string;
  let reviewerToken: string;
  let teacherId: string;
  const suffix = crypto.randomUUID();
  const password = `TerminalState-${suffix}`;

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
    const school = await prisma.school.create({ data: { name: "Terminal State Test", code: `ATS-${suffix.slice(0, 8)}` } });
    schoolId = school.id;
    const role = await prisma.role.create({ data: { schoolId, name: "Head Teacher", description: "Disposable test role" } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    const reviewer = await prisma.user.create({ data: { schoolId, email: `terminal-reviewer-${suffix}@example.test`, displayName: "Terminal Reviewer", passwordHash: `dev:${password}` } });
    reviewerId = reviewer.id;
    await prisma.userRole.create({ data: { userId: reviewerId, roleId: role.id } });
    const teacher = await prisma.teacher.create({ data: { schoolId, userId: reviewerId, staffId: `ATS-${suffix.slice(0, 8)}`, firstName: "Terminal", lastName: "Teacher", pinHash: "dev:1234" } });
    teacherId = teacher.id;
    const login = await request("/auth/login", "POST", { email: reviewer.email, password, deviceId: "00000000-0000-4000-8000-000000000001" });
    expect(login.status).toBe(201);
    reviewerToken = (await login.json() as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.auditLog.deleteMany({ where: { schoolId } });
      await prisma.teacherAttendance.deleteMany({ where: { schoolId } });
      await prisma.teacher.deleteMany({ where: { schoolId } });
      await prisma.userRole.deleteMany({ where: { userId: reviewerId } });
      await prisma.user.deleteMany({ where: { id: reviewerId } });
      await prisma.rolePermission.deleteMany({ where: { role: { schoolId } } });
      await prisma.role.deleteMany({ where: { schoolId } });
      await prisma.school.deleteMany({ where: { id: schoolId } });
    }
    await app?.close();
  });

  it("makes approval terminal and preserves its first decision", async () => {
    const correction = await createPendingCorrection("2026-10-01");
    expect((await request(`/teacher-attendance/${correction.id}/approve-correction`, "POST", {}, reviewerToken)).status).toBe(201);
    const before = await decisionSnapshot(correction.id);

    expect((await request(`/teacher-attendance/${correction.id}/approve-correction`, "POST", {}, reviewerToken)).status).toBe(409);
    expect((await request(`/teacher-attendance/${correction.id}/reject-correction`, "POST", { reason: "repeat" }, reviewerToken)).status).toBe(409);
    expect((await request(`/teacher-attendance/${correction.id}/correction-request`, "POST", { staffId: `ATS-${suffix.slice(0, 8)}`, pin: "1234", reason: "Attempt to reopen terminal correction." })).status).toBe(409);
    const terminalCheckOut = await request("/teacher-attendance/check-out", "POST", { staffId: `ATS-${suffix.slice(0, 8)}`, pin: "1234", deviceId: "terminal-state-test", occurredAt: "2026-10-01T17:30:00.000Z" });
    expect(terminalCheckOut.status, await terminalCheckOut.text()).toBe(409);

    expect(await decisionSnapshot(correction.id)).toEqual(before);
  }, 60_000);

  it("makes rejection terminal and preserves its first decision", async () => {
    const correction = await createPendingCorrection("2026-10-02");
    expect((await request(`/teacher-attendance/${correction.id}/reject-correction`, "POST", { reason: "Declined" }, reviewerToken)).status).toBe(201);
    const before = await decisionSnapshot(correction.id);

    expect((await request(`/teacher-attendance/${correction.id}/reject-correction`, "POST", { reason: "repeat" }, reviewerToken)).status).toBe(409);
    expect((await request(`/teacher-attendance/${correction.id}/approve-correction`, "POST", {}, reviewerToken)).status).toBe(409);
    expect((await request(`/teacher-attendance/${correction.id}/correction-request`, "POST", { staffId: `ATS-${suffix.slice(0, 8)}`, pin: "1234", reason: "Attempt to reopen terminal correction." })).status).toBe(409);

    expect(await decisionSnapshot(correction.id)).toEqual(before);
  }, 60_000);

  it("atomically allows exactly one concurrent decision and audit entry", async () => {
    const correction = await createPendingCorrection("2026-10-03");
    const [approve, reject] = await Promise.all([
      request(`/teacher-attendance/${correction.id}/approve-correction`, "POST", {}, reviewerToken),
      request(`/teacher-attendance/${correction.id}/reject-correction`, "POST", { reason: "Concurrent decision" }, reviewerToken)
    ]);
    const statuses = [approve.status, reject.status].sort();
    expect(statuses).toEqual([201, 409]);

    const final = await prisma.teacherAttendance.findUniqueOrThrow({ where: { id: correction.id } });
    expect(["APPROVED", "REJECTED"]).toContain(final.approvalStatus);
    expect(final.version).toBe(2);
    expect(await prisma.auditLog.count({ where: { entityId: correction.id, action: { in: ["TEACHER_ATTENDANCE_CORRECTION_APPROVED", "TEACHER_ATTENDANCE_CORRECTION_REJECTED"] } } })).toBe(1);
    if (final.approvalStatus === "APPROVED") {
      expect(final.status).toBe("CORRECTED");
      expect(final.checkInAt?.toISOString()).toBe("2026-10-03T08:00:00.000Z");
    } else {
      expect(final.status).toBe("CORRECTION_REQUESTED");
      expect(final.checkInAt?.toISOString()).toBe("2026-10-03T08:30:00.000Z");
    }
  }, 60_000);

  async function createPendingCorrection(day: string) {
    const attendanceDate = new Date(`${day}T17:30:00.000Z`);
    attendanceDate.setHours(0, 0, 0, 0);
    return prisma.teacherAttendance.create({
      data: {
        schoolId,
        teacherId,
        attendanceDate,
        checkInAt: new Date(`${day}T08:30:00.000Z`),
        checkOutAt: new Date(`${day}T16:00:00.000Z`),
        status: "CORRECTION_REQUESTED",
        approvalStatus: "PENDING",
        correctionRequestedBy: teacherId,
        correctionReason: "Terminal state regression test.",
        requestedCheckInAt: new Date(`${day}T08:00:00.000Z`),
        requestedCheckOutAt: new Date(`${day}T16:30:00.000Z`)
      }
    });
  }

  async function decisionSnapshot(id: string) {
    const attendance = await prisma.teacherAttendance.findUniqueOrThrow({ where: { id } });
    return {
      approvalStatus: attendance.approvalStatus,
      status: attendance.status,
      checkInAt: attendance.checkInAt?.toISOString(),
      checkOutAt: attendance.checkOutAt?.toISOString(),
      requestedCheckInAt: attendance.requestedCheckInAt?.toISOString(),
      requestedCheckOutAt: attendance.requestedCheckOutAt?.toISOString(),
      approvedBy: attendance.approvedBy,
      approvedAt: attendance.approvedAt?.toISOString(),
      version: attendance.version,
      decisionAuditCount: await prisma.auditLog.count({ where: { entityId: id, action: { in: ["TEACHER_ATTENDANCE_CORRECTION_APPROVED", "TEACHER_ATTENDANCE_CORRECTION_REJECTED"] } } })
    };
  }

  function request(path: string, method: "POST", body: unknown, token?: string) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
  }
});
