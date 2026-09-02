import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { CurrentUser, PermissionKey, SyncEntityType, UserRole } from "@aethina/shared-types";
import { AcademicsService } from "../src/academics/academics.service.js";
import { AttendanceService } from "../src/attendance/attendance.service.js";
import { FinanceService } from "../src/finance/finance.service.js";
import { SyncService } from "../src/sync/sync.service.js";
import { StudentsService } from "../src/students/students.service.js";
import { UsersService } from "../src/users/users.service.js";

const schoolId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";
const studentId = "44444444-4444-4444-8444-444444444444";
const termId = "55555555-5555-4555-8555-555555555555";
const feeStructureId = "66666666-6666-4666-8666-666666666666";
const invoiceId = "77777777-7777-4777-8777-777777777777";
const assessmentId = "88888888-8888-4888-8888-888888888888";
const subjectId = "99999999-9999-4999-8999-999999999999";
const classId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const upperClassId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const teacherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const deviceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const actor: CurrentUser = {
  id: userId,
  schoolId,
  email: "actor@aethina.test",
  displayName: "Actor",
  roles: [UserRole.Administrator],
  permissions: [PermissionKey.SyncReview],
  mustChangePassword: false
};

describe("tenant and referential integrity regressions", () => {
  it("rejects manual invoices when referenced records are outside the actor school", async () => {
    const prisma = {
      student: { findFirst: vi.fn().mockResolvedValue(null) },
      term: { findFirst: vi.fn().mockResolvedValue({ id: termId }) },
      feeStructure: { findFirst: vi.fn().mockResolvedValue({ id: feeStructureId, classId }) },
      studentInvoice: { create: vi.fn() }
    };
    const service = new FinanceService(prisma as never, { record: vi.fn() } as never);

    await expect(service.createManualInvoice(actor, {
      studentId,
      termId,
      feeStructureId,
      dueDate: "2026-09-01T00:00:00.000Z",
      lines: [{ description: "Tuition", category: "Tuition", amount: 1000 }]
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.studentInvoice.create).not.toHaveBeenCalled();
  });

  it("rejects fee adjustments unless the invoice belongs to the same school and student", async () => {
    const tx = {
      studentInvoice: { findFirst: vi.fn().mockResolvedValue(null) },
      feeAdjustment: { create: vi.fn() }
    };
    const prisma = {
      financialSetting: { upsert: vi.fn().mockResolvedValue({ feeWaiverApprovalThreshold: 5000 }) },
      $transaction: vi.fn(async (callback: (tx: typeof tx) => unknown) => callback(tx))
    };
    const service = new FinanceService(prisma as never, { record: vi.fn() } as never);

    await expect(service.createAdjustment(actor, {
      studentId,
      invoiceId,
      adjustmentType: "WAIVER",
      amount: 1000,
      reason: "Approved hardship waiver"
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.feeAdjustment.create).not.toHaveBeenCalled();
  });

  it("rejects marks for students outside the assessment roster before writing marks", async () => {
    const prisma = {
      assessment: {
        findFirst: vi.fn().mockResolvedValue({
          id: assessmentId,
          schoolId,
          subjectId,
          classId,
          streamId: null,
          teacherId,
          maxScore: 100,
          weight: 100
        })
      },
      teacher: { findFirst: vi.fn().mockResolvedValue({ id: teacherId }) },
      teacherSubjectAssignment: { findFirst: vi.fn().mockResolvedValue({ id: "assignment-1" }) },
      student: { findMany: vi.fn().mockResolvedValue([]) },
      mark: { upsert: vi.fn() },
      $transaction: vi.fn()
    };
    const service = new AcademicsService(prisma as never, { record: vi.fn() } as never);

    await expect(service.saveMarks({ ...actor, permissions: [PermissionKey.MarksEntry] }, {
      assessmentId,
      entries: [{ studentId, score: 75 }],
      status: "SUBMITTED"
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("scopes lower-school DOS student lists to S1-S2 classes", async () => {
    const prisma = {
      class: { findMany: vi.fn().mockResolvedValue([{ id: classId }]) },
      student: { findMany: vi.fn().mockResolvedValue([]) }
    };
    const service = new StudentsService(prisma as never, { record: vi.fn() } as never, {} as never);
    const lowerDos = {
      ...actor,
      roles: ["Lower School Dean of Studies"],
      permissions: [PermissionKey.StudentsRead, PermissionKey.AcademicSetupManage]
    };

    await service.list(lowerDos, {});

    expect(prisma.student.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ currentClassId: { in: [classId] } }]
      })
    }));
  });

  it("rejects scoped DOS academic writes outside their level band", async () => {
    const prisma = {
      class: { findMany: vi.fn().mockResolvedValue([{ id: classId }]) },
      examination: { findFirst: vi.fn() },
      subject: { findFirst: vi.fn() },
      assessment: { aggregate: vi.fn(), create: vi.fn() }
    };
    const service = new AcademicsService(prisma as never, { record: vi.fn() } as never);
    const lowerDos = {
      ...actor,
      roles: ["Lower School Dean of Studies"],
      permissions: [PermissionKey.AcademicsManage]
    };

    await expect(service.createAssessment(lowerDos, {
      termId,
      examinationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      subjectId,
      classId: upperClassId,
      name: "Upper literature",
      maxScore: 100,
      weight: 100
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.assessment.create).not.toHaveBeenCalled();
  });

  it("filters sync pulls by role permissions and blocks unauthorized writes", async () => {
    const prisma = {
      student: { findMany: vi.fn().mockResolvedValue([{ id: studentId, schoolId }]) },
      guardian: { findMany: vi.fn().mockResolvedValue([{ id: "guardian-1", schoolId }]) },
      teacherAttendance: { findMany: vi.fn() },
      payment: { findMany: vi.fn().mockResolvedValue([{ id: "payment-1", schoolId }]) },
      inventoryItem: { findMany: vi.fn() },
      stockMovement: { findMany: vi.fn() },
      payrollRecord: { findMany: vi.fn().mockResolvedValue([{ id: "payroll-1", schoolId }]) },
      budgetRequest: { findMany: vi.fn().mockResolvedValue([{ id: "budget-request-1", schoolId }]) },
      mark: { findMany: vi.fn() },
      synchronizationRecord: { findUnique: vi.fn(), create: vi.fn() }
    };
    const service = new SyncService(prisma as never, {} as never, {} as never);
    const bursar = { ...actor, roles: [UserRole.Bursar], permissions: [PermissionKey.FinanceRead, PermissionKey.FinanceManage, PermissionKey.BudgetManage] };

    const pulled = await service.pull(bursar, { deviceId, schoolId, since: null });

    expect(pulled.records.payments).toHaveLength(1);
    expect(pulled.records.budgetRequests).toHaveLength(1);
    expect(pulled.records.payrollRecords).toEqual([]);
    expect(prisma.payrollRecord.findMany).not.toHaveBeenCalled();

    await expect(service.push(bursar, {
      deviceId,
      schoolId,
      changes: [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        entityType: SyncEntityType.AssessmentMark,
        entityId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        operation: "UPDATE",
        payload: { score: 99 },
        baseVersion: null,
        createdAt: new Date().toISOString(),
        retryCount: 0
      }]
    })).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.synchronizationRecord.create).not.toHaveBeenCalled();
  });

  it("rejects attendance correction requests for a different teacher record", async () => {
    const update = vi.fn();
    const service = new AttendanceService({
      teacherAttendance: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "attendance-1", teacherId: teacherId, deletedAt: null }),
        update
      }
    } as never, {} as never, {} as never);

    await expect(service.requestCorrection("attendance-1", {
      requestedBy: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      reason: "The attendance correction belongs to another teacher."
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(update).not.toHaveBeenCalled();
  });

  it("rejects self-deactivation for the currently authenticated staff user", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn(),
        update: vi.fn()
      }
    };
    const service = new UsersService(prisma as never, { record: vi.fn() } as never, {} as never);

    await expect(service.setActive(actor, actor.id, false)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
