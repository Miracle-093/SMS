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

function money(value: { toNumber(): number } | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "object" && "toNumber" in value ? value.toNumber() : Number(value);
}
