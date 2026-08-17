import "reflect-metadata";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { loadRootEnv } from "../scripts/env.js";

loadRootEnv();

describe("Phase 1 core integration", () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let token: string;
  let schoolId: string;
  let classOneId: string;
  let classTwoId: string;
  let streamId: string;
  let academicYearId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = app.get(PrismaService);

    const login = await post("/auth/login", { email: "admin@aethina.test", password: "AdminPass123", deviceId: "00000000-0000-4000-8000-000000000001" });
    token = login.accessToken;
    schoolId = login.user.schoolId;

    const config = await authGet("/school-config");
    academicYearId = config.school.currentAcademicYearId ?? config.academicYears[0].id;
    classOneId = config.classes.find((item: { name: string }) => item.name === "Grade 1").id;
    classTwoId = config.classes.find((item: { name: string }) => item.name === "Grade 2").id;
    streamId = config.classes.find((item: { id: string }) => item.id === classOneId).streams[0].id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it("logs in with permissions and creates a student with portal credentials", async () => {
    const admissionNo = `TST-${Date.now()}`;
    const registration = registrationBody(admissionNo);
    const created = await authPost("/students", registration);

    expect(created.student.admissionNo).toBe(admissionNo);
    expect(created.portal.username).toBe(admissionNo.toLowerCase());
    expect(created.portalTemporaryPassword).toMatch(/^Ae-/);
    expect(created.portal.passwordHash).toBeUndefined();

    const duplicate = await rawPost("/students", registration, token);
    expect(duplicate.status).toBe(409);

    const reset = await authPost(`/students/${created.student.id}/reset-portal-credentials`, {});
    expect(reset.temporaryPassword).toMatch(/^Ae-/);
    expect(reset.portal.username).toBe(admissionNo.toLowerCase());

    const promotion = await authPost("/students/promotions", {
      studentId: created.student.id,
      previousAcademicYearId: academicYearId,
      previousClassId: classOneId,
      newAcademicYearId: academicYearId,
      newClassId: classTwoId,
      promotionDate: new Date().toISOString(),
      notes: "Integration promotion"
    });
    expect(promotion.newClassId).toBe(classTwoId);

    const auditCount = await prisma.auditLog.count({
      where: { schoolId, entityId: created.student.id, action: { in: ["STUDENT_CREATED", "PORTAL_CREDENTIAL_RESET", "STUDENT_PROMOTED"] } }
    });
    expect(auditCount).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it("supports attendance review, correction approval, sync conflict review and audit browsing", async () => {
    const teacher = await prisma.teacher.findUniqueOrThrow({ where: { staffId: "TCH-001" } });
    const attendanceDate = new Date("2026-08-11T00:00:00.000Z");
    const attendanceDayEnd = new Date("2026-08-13T23:59:59.999Z");
    await prisma.teacherAttendance.deleteMany({ where: { teacherId: teacher.id, attendanceDate: { gte: attendanceDate, lte: attendanceDayEnd } } });

    const checkIn = await post("/teacher-attendance/check-in", {
      staffId: "TCH-001",
      pin: "1234",
      deviceId: "00000000-0000-4000-8000-000000000001",
      occurredAt: "2026-08-12T08:25:00.000Z"
    });
    expect(checkIn.status).toBe("LATE");

    const checkOut = await post("/teacher-attendance/check-out", {
      staffId: "TCH-001",
      pin: "1234",
      deviceId: "00000000-0000-4000-8000-000000000001",
      occurredAt: "2026-08-12T16:30:00.000Z"
    });
    expect(checkOut.status).toBe("CHECKED_OUT");

    const dayRows = await authGet("/teacher-attendance?date=2026-08-12");
    expect(dayRows.some((row: { id: string }) => row.id === checkIn.id)).toBe(true);

    await post(`/teacher-attendance/${checkIn.id}/correction-request`, {
      requestedBy: teacher.id,
      reason: "Missed morning assembly duty confirmation.",
      requestedCheckInAt: "2026-08-12T07:50:00.000Z",
      requestedCheckOutAt: null
    });
    const correctionRows = await authGet("/teacher-attendance/correction-requests");
    expect(correctionRows.some((row: { id: string }) => row.id === checkIn.id)).toBe(true);

    const approved = await authPost(`/teacher-attendance/${checkIn.id}/approve-correction`, {});
    expect(approved.approvalStatus).toBe("APPROVED");
    expect(new Date(approved.checkInAt).toISOString()).toBe("2026-08-12T07:50:00.000Z");

    const conflict = await prisma.synchronizationConflict.create({
      data: {
        schoolId,
        deviceId: "00000000-0000-4000-8000-000000000001",
        entityType: "PAYMENT",
        entityId: crypto.randomUUID(),
        localVersion: 1,
        serverVersion: 2,
        localPayload: { amount: 100 },
        serverPayload: { amount: 120 },
        sensitivity: "SENSITIVE",
        reason: "Integration conflict"
      }
    });

    const conflicts = await authGet("/sync/conflicts");
    expect(conflicts.some((row: { id: string }) => row.id === conflict.id)).toBe(true);
    const resolved = await authPost(`/sync/conflicts/${conflict.id}/resolve`, {});
    expect(resolved.status).toBe("RESOLVED");

    const audit = await authGet("/audit?action=TEACHER_ATTENDANCE");
    expect(audit.some((row: { action: string }) => row.action === "TEACHER_ATTENDANCE_CORRECTION_APPROVED")).toBe(true);
  }, 60_000);

  it("supports finance, approvals, dashboard aggregates and risk review", async () => {
    const config = await authGet("/school-config");
    const termId = config.school.currentTermId;
    const feeName = `Integration Tuition ${Date.now()}`;
    const fee = await authPost("/finance/fee-structures", {
      academicYearId,
      termId,
      classId: classOneId,
      category: "Tuition",
      name: feeName,
      amount: 123000,
      dueDate: new Date("2026-03-01").toISOString(),
      isMandatory: true,
      isActive: true
    });
    expect(fee.name).toBe(feeName);

    const duplicate = await rawPost("/finance/fee-structures", {
      academicYearId,
      termId,
      classId: classOneId,
      category: "Tuition",
      name: feeName,
      amount: 123000,
      dueDate: new Date("2026-03-01").toISOString(),
      isMandatory: true,
      isActive: true
    }, token);
    expect(duplicate.status).toBe(409);

    const generated = await authPost("/finance/invoices/generate", {
      academicYearId,
      termId,
      classId: classOneId,
      dueDate: new Date("2026-03-01").toISOString()
    });
    expect(generated.created).toBeGreaterThan(0);

    const invoices = await authGet("/finance/invoices");
    const invoice = invoices.find((row: { invoiceNo: string; balance: string }) => row.invoiceNo !== "INV-2026-001" && Number(row.balance) >= 1000);
    expect(invoice).toBeTruthy();

    const paymentReference = `INT-PAY-${Date.now()}`;
    const payment = await authPost("/finance/payments", {
      invoiceId: invoice.id,
      amount: 1000,
      method: "CASH",
      reference: paymentReference,
      paidAt: new Date().toISOString(),
      notes: "Integration partial payment"
    });
    expect(payment.receipt.receiptNo).toMatch(/^RCT-/);
    expect(Number(payment.remainingBalance)).toBeLessThan(Number(invoice.balance));

    const duplicatePayment = await rawPost("/finance/payments", {
      invoiceId: invoice.id,
      amount: 100,
      method: "CASH",
      reference: paymentReference,
      paidAt: new Date().toISOString()
    }, token);
    expect(duplicatePayment.status).toBe(409);

    const overpayment = await rawPost("/finance/payments", {
      invoiceId: invoice.id,
      amount: 999999999,
      method: "CASH",
      reference: `INT-OVER-${Date.now()}`,
      paidAt: new Date().toISOString()
    }, token);
    expect(overpayment.status).toBe(400);

    const budget = await authPost("/finance/budgets", {
      academicYearId,
      termId,
      name: `Integration Budget ${Date.now()}`,
      department: "Academics",
      category: "Stationery",
      amount: 1500000,
      warningThreshold: 80,
      hardCap: true,
      period: "Term 1",
      year: 2026
    });
    const request = await authPost("/finance/budget-requests", {
      budgetId: budget.id,
      amount: 200000,
      reason: "Integration teaching resources request"
    });
    expect(request.approvalStatus).toBe("PENDING");

    const inbox = await authGet("/approvals");
    const workflow = inbox.find((row: { entityId: string }) => row.entityId === request.id);
    expect(workflow).toBeTruthy();
    const selfApproval = await rawPost(`/approvals/${workflow.id}/decision`, { decision: "APPROVED", comment: "Self approval attempt" }, token);
    expect(selfApproval.status).toBe(400);

    const dashboard = await authGet("/dashboard/summary");
    expect(dashboard.activeStudents).toBeGreaterThanOrEqual(10);
    expect(dashboard.expectedFees).toBeGreaterThan(0);

    const risks = await authGet("/risk-alerts");
    if (risks.length > 0) {
      const reviewed = await authPost(`/risk-alerts/${risks[0].id}/review`, { status: "UNDER_REVIEW", notes: "Integration review" });
      expect(reviewed.status).toBe("UNDER_REVIEW");
    }
  }, 60_000);

  it("supports portal login while blocking portal users from staff endpoints", async () => {
    const portalLogin = await post("/auth/portal-login", {
      username: "adm-001",
      password: "StudentPass123",
      deviceId: "00000000-0000-4000-8000-000000000001"
    });
    expect(portalLogin.user.roles).toContain("PORTAL_USER");

    const home = await rawGet("/portal/home", portalLogin.accessToken);
    expect(home.status).toBe(200);
    const portalHome = await home.json();
    expect(portalHome.student.admissionNo).toBe("ADM-001");

    const staffOnly = await rawGet("/students", portalLogin.accessToken);
    expect(staffOnly.status).toBe(403);
  }, 60_000);

  it("exposes a lightweight health endpoint", async () => {
    const response = await rawGet("/health");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
  }, 60_000);

  async function authGet(path: string) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`${path} failed with ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  async function authPost(path: string, body: unknown) {
    const response = await rawPost(path, body, token);
    if (!response.ok) {
      throw new Error(`${path} failed with ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  async function post(path: string, body: unknown) {
    const response = await rawPost(path, body);
    expect(response.ok).toBe(true);
    return response.json();
  }

  function rawPost(path: string, body: unknown, accessToken?: string) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify(body)
    });
  }

  function rawGet(path: string, accessToken?: string) {
    return fetch(`${baseUrl}${path}`, {
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    });
  }

  function registrationBody(admissionNo: string) {
    return {
      schoolId,
      admissionNo,
      firstName: "Test",
      middleName: "Phase",
      lastName: "Student",
      gender: "OTHER",
      dateOfBirth: new Date("2018-03-10").toISOString(),
      currentClassId: classOneId,
      currentStreamId: streamId,
      currentAcademicYearId: academicYearId,
      admissionDate: new Date("2026-01-15").toISOString(),
      previousSchool: null,
      status: "ACTIVE",
      guardianFullName: "Phase Guardian",
      guardianRelationship: "Guardian",
      guardianPhone: "+254722123456",
      guardianEmail: "phase.guardian@example.test",
      guardianAddress: "Integration Estate",
      emergencyContact: "+254733123456",
      medicalNotes: "None",
      photoUrl: null,
      supportingDocuments: [],
      notes: "Integration test student"
    };
  }
});
