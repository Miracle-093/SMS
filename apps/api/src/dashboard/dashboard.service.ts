import { Inject, Injectable } from "@nestjs/common";
import type { CurrentUser } from "@aethina/shared-types";
import { PermissionKey } from "@aethina/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(user: CurrentUser) {
    const canSeeFinance = user.permissions.includes(PermissionKey.FinanceRead) || user.permissions.includes(PermissionKey.FinanceManage);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const school = await this.prisma.school.findUnique({ where: { id: user.schoolId } });
    const termId = school?.currentTermId ?? undefined;
    const [
      activeStudents,
      teachers,
      attendanceToday,
      pendingBudgetApprovals,
      pendingExpenseApprovals,
      unresolvedSyncConflicts,
      suspiciousFinancialActivities,
      lowStockItems,
      marksAwaitingApproval,
      publishedReportCards,
      activePayrollRuns,
      failedNotifications,
      portalLogins,
      invoiceTotals,
      expenseTotals
    ] = await Promise.all([
      this.prisma.student.count({ where: { schoolId: user.schoolId, status: "ACTIVE", deletedAt: null } }),
      this.prisma.teacher.count({ where: { schoolId: user.schoolId } }),
      this.prisma.teacherAttendance.count({ where: { schoolId: user.schoolId, attendanceDate: { gte: today, lt: tomorrow } } }),
      this.prisma.approvalWorkflow.count({ where: { schoolId: user.schoolId, entityType: "BUDGET_REQUEST", status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      this.prisma.approvalWorkflow.count({ where: { schoolId: user.schoolId, entityType: "EXPENSE", status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      this.prisma.synchronizationConflict.count({ where: { schoolId: user.schoolId, status: "OPEN" } }),
      this.prisma.riskAlert.count({ where: { schoolId: user.schoolId, status: { in: ["NEW", "UNDER_REVIEW", "ESCALATED"] } } }),
      this.lowStockCount(user.schoolId),
      this.prisma.assessment.count({ where: { schoolId: user.schoolId, status: "SUBMITTED" } }),
      this.prisma.reportCard.count({ where: { schoolId: user.schoolId, status: "PUBLISHED", deletedAt: null, ...(termId ? { termId } : {}) } }),
      this.prisma.payrollRun.count({ where: { schoolId: user.schoolId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] }, deletedAt: null } }),
      this.prisma.notification.count({ where: { schoolId: user.schoolId, status: "FAILED", deletedAt: null } }),
      this.prisma.auditLog.count({ where: { schoolId: user.schoolId, action: "PORTAL_LOGIN_SUCCEEDED", createdAt: { gte: today } } }),
      canSeeFinance
        ? this.prisma.studentInvoice.aggregate({ where: { schoolId: user.schoolId, deletedAt: null, ...(termId ? { termId } : {}) }, _sum: { amount: true, amountPaid: true, balance: true, adjustmentTotal: true } })
        : Promise.resolve(null),
      canSeeFinance
        ? this.prisma.expense.aggregate({ where: { schoolId: user.schoolId, deletedAt: null, approvalStatus: "APPROVED" }, _sum: { amount: true } })
        : Promise.resolve(null)
    ]);
    const expectedFees = money(invoiceTotals?._sum.amount);
    const collectedFees = money(invoiceTotals?._sum.amountPaid);
    const outstandingFees = money(invoiceTotals?._sum.balance);
    return {
      asOf: new Date().toISOString(),
      permissions: { finance: canSeeFinance, approvals: user.permissions.includes(PermissionKey.ApprovalReview), risk: user.permissions.includes(PermissionKey.RiskReview) },
      activeStudents,
      teachers,
      expectedFees: canSeeFinance ? expectedFees : null,
      collectedFees: canSeeFinance ? collectedFees : null,
      outstandingFees: canSeeFinance ? outstandingFees : null,
      collectionPercentage: canSeeFinance && expectedFees ? Math.round((collectedFees / expectedFees) * 100) : null,
      discountsWaivers: canSeeFinance ? money(invoiceTotals?._sum.adjustmentTotal) : null,
      expenses: canSeeFinance ? money(expenseTotals?._sum.amount) : null,
      netCashMovement: canSeeFinance ? collectedFees - money(expenseTotals?._sum.amount) : null,
      attendanceToday,
      pendingBudgetApprovals,
      pendingExpenseApprovals,
      unresolvedSyncConflicts,
      suspiciousFinancialActivities,
      lowStockItems,
      marksAwaitingApproval,
      publishedReportCards,
      activePayrollRuns,
      failedNotifications,
      portalLoginsToday: portalLogins
    };
  }

  async alerts(user: CurrentUser) {
    const [approvals, reversals, conflicts, attendanceCorrections, risks] = await Promise.all([
      this.prisma.approvalWorkflow.findMany({ where: { schoolId: user.schoolId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.paymentReversal.findMany({ where: { schoolId: user.schoolId, approvalStatus: "PENDING", deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.synchronizationConflict.findMany({ where: { schoolId: user.schoolId, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.teacherAttendance.findMany({ where: { schoolId: user.schoolId, approvalStatus: "PENDING", status: "CORRECTION_REQUESTED" }, orderBy: { updatedAt: "desc" }, take: 10 }),
      this.prisma.riskAlert.findMany({ where: { schoolId: user.schoolId, status: { in: ["NEW", "UNDER_REVIEW", "ESCALATED"] } }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], take: 20 })
    ]);
    return [
      ...approvals.map((item) => ({ type: "APPROVAL", entityType: item.entityType, entityId: item.entityId, title: `${item.entityType.replaceAll("_", " ")} awaiting approval`, createdAt: item.createdAt })),
      ...reversals.map((item) => ({ type: "REVERSAL", entityType: "PAYMENT_REVERSAL", entityId: item.id, title: "Payment reversal awaiting review", createdAt: item.createdAt })),
      ...conflicts.map((item) => ({ type: "SYNC_CONFLICT", entityType: item.entityType, entityId: item.id, title: item.reason, createdAt: item.createdAt })),
      ...attendanceCorrections.map((item) => ({ type: "ATTENDANCE_CORRECTION", entityType: "TEACHER_ATTENDANCE", entityId: item.id, title: "Teacher attendance correction request", createdAt: item.updatedAt })),
      ...risks.map((item) => ({ type: "RISK_ALERT", entityType: item.entityType, entityId: item.id, title: item.reason, severity: item.severity, createdAt: item.createdAt }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30);
  }

  recentActivity(schoolId: string) {
    return this.prisma.auditLog.findMany({ where: { schoolId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 30 });
  }

  async teacherWorkspace(user: CurrentUser) {
    const teacher = await this.prisma.teacher.findFirst({ where: { schoolId: user.schoolId, userId: user.id } });
    if (!teacher) {
      return {
        teacher: null,
        classTeacherAssignments: [],
        subjectAssignments: [],
        classLearners: [],
        openAssessments: [],
        timetable: [],
        announcements: []
      };
    }

    const school = await this.prisma.school.findUnique({ where: { id: user.schoolId } });
    const now = new Date();
    const [classTeacherAssignments, subjectAssignments] = await Promise.all([
      this.prisma.classTeacherAssignment.findMany({
        where: {
          schoolId: user.schoolId,
          teacherId: teacher.id,
          isActive: true,
          ...(school?.currentAcademicYearId ? { academicYearId: school.currentAcademicYearId } : {}),
          ...(school?.currentTermId ? { OR: [{ termId: null }, { termId: school.currentTermId }] } : {})
        },
        include: { class: true, stream: true, academicYear: true, term: true },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.teacherSubjectAssignment.findMany({
        where: { schoolId: user.schoolId, teacherId: teacher.id, isActive: true },
        orderBy: { createdAt: "desc" }
      })
    ]);
    const timetableVisibility = [
      { teacherId: teacher.id },
      ...classTeacherAssignments.map((assignment) => ({
        classId: assignment.classId,
        ...(assignment.streamId ? { OR: [{ streamId: null }, { streamId: assignment.streamId }] } : {})
      }))
    ];
    const timetable = await this.prisma.timetableEntry.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        academicYearId: school?.currentAcademicYearId ?? undefined,
        termId: school?.currentTermId ?? undefined,
        OR: timetableVisibility
      },
      orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
      take: 30
    });
    const announcements = await this.prisma.announcement.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        publishAt: { lte: now },
        OR: [
          { audience: { in: ["ALL", "STAFF", "TEACHERS", "TEACHER"] } },
          ...classTeacherAssignments.map((assignment) => ({
            classId: assignment.classId,
            ...(assignment.streamId ? { OR: [{ streamId: null }, { streamId: assignment.streamId }] } : {})
          }))
        ],
        AND: [{
          OR: [
            { expiresAt: null },
            { expiresAt: { gte: now } }
          ]
        }]
      },
      orderBy: [{ priority: "desc" }, { publishAt: "desc" }],
      take: 10
    });
    const assessmentScopes = subjectAssignments.map((assignment) => ({
      subjectId: assignment.subjectId,
      classId: assignment.classId,
      ...(assignment.streamId ? { streamId: assignment.streamId } : {})
    }));
    const openAssessments = await this.prisma.assessment.findMany({
      where: {
        schoolId: user.schoolId,
        status: { in: ["DRAFT", "OPEN", "MARKS_ENTRY", "RETURNED_FOR_CORRECTION"] },
        ...(school?.currentTermId ? { termId: school.currentTermId } : {}),
        OR: [{ teacherId: teacher.id }, ...assessmentScopes]
      },
      include: { subject: true, examination: true },
      orderBy: { updatedAt: "desc" },
      take: 20
    });

    const classIds = new Set<string>();
    const streamIds = new Set<string>();
    const subjectIds = new Set<string>();
    for (const assignment of subjectAssignments) {
      classIds.add(assignment.classId);
      if (assignment.streamId) streamIds.add(assignment.streamId);
      subjectIds.add(assignment.subjectId);
    }
    for (const assignment of classTeacherAssignments) {
      classIds.add(assignment.classId);
      if (assignment.streamId) streamIds.add(assignment.streamId);
    }
    for (const entry of timetable) {
      classIds.add(entry.classId);
      if (entry.streamId) streamIds.add(entry.streamId);
      subjectIds.add(entry.subjectId);
    }
    for (const assessment of openAssessments) {
      if (assessment.classId) classIds.add(assessment.classId);
      if (assessment.streamId) streamIds.add(assessment.streamId);
      subjectIds.add(assessment.subjectId);
    }

    const [classes, streams, subjects] = await Promise.all([
      this.prisma.class.findMany({ where: { schoolId: user.schoolId, id: { in: [...classIds] } } }),
      this.prisma.stream.findMany({ where: { schoolId: user.schoolId, id: { in: [...streamIds] } } }),
      this.prisma.subject.findMany({ where: { schoolId: user.schoolId, id: { in: [...subjectIds] } } })
    ]);
    const classById = new Map(classes.map((klass) => [klass.id, klass]));
    const streamById = new Map(streams.map((stream) => [stream.id, stream]));
    const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));

    const classScopes = [
      ...classTeacherAssignments.map((assignment) => ({ classId: assignment.classId, streamId: assignment.streamId ?? null })),
      ...subjectAssignments.map((assignment) => ({ classId: assignment.classId, streamId: assignment.streamId ?? null }))
    ];
    const uniqueScopes = Array.from(new Map(classScopes.map((scope) => [`${scope.classId}:${scope.streamId ?? "all"}`, scope])).values());
    const classLearners = await Promise.all(uniqueScopes.map(async (scope) => ({
      classId: scope.classId,
      streamId: scope.streamId,
      label: classStreamLabel(classById.get(scope.classId)?.name ?? "Class", scope.streamId ? streamById.get(scope.streamId)?.name : null),
      activeStudents: await this.prisma.student.count({
        where: { schoolId: user.schoolId, deletedAt: null, status: "ACTIVE", currentClassId: scope.classId, ...(scope.streamId ? { currentStreamId: scope.streamId } : {}) }
      })
    })));

    const visibleAnnouncements = announcements.filter((announcement) => {
      const audience = announcement.audience.toUpperCase();
      if (["ALL", "STAFF", "TEACHERS", "TEACHER"].includes(audience)) return true;
      if (announcement.classId && uniqueScopes.some((scope) => scope.classId === announcement.classId && (!announcement.streamId || !scope.streamId || scope.streamId === announcement.streamId))) return true;
      return false;
    });

    return {
      teacher: { id: teacher.id, staffId: teacher.staffId, firstName: teacher.firstName, lastName: teacher.lastName },
      classTeacherAssignments: classTeacherAssignments.map((assignment) => ({
        id: assignment.id,
        classId: assignment.classId,
        streamId: assignment.streamId,
        label: classStreamLabel(assignment.class.name, assignment.stream?.name),
        academicYear: assignment.academicYear.name,
        term: assignment.term?.name ?? "All terms"
      })),
      subjectAssignments: subjectAssignments.map((assignment) => ({
        id: assignment.id,
        subjectId: assignment.subjectId,
        classId: assignment.classId,
        streamId: assignment.streamId,
        subject: subjectById.get(assignment.subjectId)?.name ?? "Subject",
        label: classStreamLabel(classById.get(assignment.classId)?.name ?? "Class", assignment.streamId ? streamById.get(assignment.streamId)?.name : null)
      })),
      classLearners,
      openAssessments: openAssessments.map((assessment) => ({
        id: assessment.id,
        name: assessment.name,
        status: assessment.status,
        subject: assessment.subject.name,
        examination: assessment.examination?.name ?? "Continuous assessment",
        classId: assessment.classId,
        streamId: assessment.streamId
      })),
      timetable: timetable.map((entry) => ({
        id: entry.id,
        dayOfWeek: entry.dayOfWeek,
        periodNumber: entry.periodNumber,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        room: entry.room,
        subject: subjectById.get(entry.subjectId)?.name ?? "Subject",
        class: classStreamLabel(classById.get(entry.classId)?.name ?? "Class", entry.streamId ? streamById.get(entry.streamId)?.name : null)
      })),
      announcements: visibleAnnouncements.map((announcement) => ({
        id: announcement.id,
        title: announcement.title,
        message: announcement.message,
        priority: announcement.priority,
        publishAt: announcement.publishAt
      }))
    };
  }

  private async lowStockCount(schoolId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "InventoryItem"
      WHERE "schoolId" = ${schoolId}
        AND "deletedAt" IS NULL
        AND "quantity" <= "reorderLevel"
    `;
    return Number(rows[0]?.count ?? 0);
  }
}

function classStreamLabel(className: string, streamName?: string | null) {
  return streamName ? `${className} ${streamName}` : className;
}

function money(value: { toNumber(): number } | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "object" && "toNumber" in value ? value.toNumber() : Number(value);
}
