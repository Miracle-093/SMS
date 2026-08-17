import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus, CurrentUser } from "@aethina/shared-types";
import { approvalDecisionSchema } from "@aethina/validation";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class ApprovalsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  inbox(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.approvalWorkflow.findMany({
      where: { schoolId, status: query.status ?? { in: ["SUBMITTED", "UNDER_REVIEW"] }, entityType: query.entityType },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async decide(actor: CurrentUser, id: string, body: unknown) {
    const input = approvalDecisionSchema.parse(body);
    const workflow = await this.prisma.approvalWorkflow.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!workflow) throw new NotFoundException("Approval workflow not found.");
    if (workflow.requestedBy === actor.id) throw new BadRequestException("Requester cannot approve their own request.");
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(workflow.status)) throw new ConflictException("Workflow has already been decided.");

    const approved = input.decision === "APPROVED";
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.approvalWorkflow.update({
        where: { id },
        data: {
          status: input.decision,
          decision: input.decision,
          decisionDate: new Date(),
          comment: input.comment ?? null,
          nextApprover: input.nextApprover ?? null,
          currentApprover: input.nextApprover ?? actor.id
        }
      });

      if (workflow.entityType === "BUDGET_REQUEST") {
        const request = await tx.budgetRequest.update({ where: { id: workflow.entityId }, data: { approvalStatus: approved ? ApprovalStatus.Approved : ApprovalStatus.Rejected } });
        if (approved) await tx.budget.update({ where: { id: request.budgetId }, data: { committedAmount: { increment: request.amount }, version: { increment: 1 } } });
      }

      if (workflow.entityType === "EXPENSE") {
        const expense = await tx.expense.update({ where: { id: workflow.entityId }, data: { approvalStatus: approved ? ApprovalStatus.Approved : ApprovalStatus.Rejected } });
        if (approved && expense.budgetId) await tx.budget.update({ where: { id: expense.budgetId }, data: { spentAmount: { increment: expense.amount }, version: { increment: 1 } } });
      }

      if (workflow.entityType === "FEE_ADJUSTMENT") {
        const adjustment = await tx.feeAdjustment.update({
          where: { id: workflow.entityId },
          data: { approvalStatus: approved ? ApprovalStatus.Approved : ApprovalStatus.Rejected, approvedBy: approved ? actor.id : null, approvedAt: approved ? new Date() : null }
        });
        if (approved) {
          const invoice = await tx.studentInvoice.findUniqueOrThrow({ where: { id: adjustment.invoiceId } });
          const newAdjustment = Number(invoice.adjustmentTotal) + Number(adjustment.amount);
          const newBalance = Math.max(Number(invoice.balance) - Number(adjustment.amount), 0);
          await tx.studentInvoice.update({ where: { id: invoice.id }, data: { adjustmentTotal: newAdjustment, balance: newBalance, status: newBalance === 0 ? "PAID" : invoice.status, version: { increment: 1 } } });
        }
      }

      if (workflow.entityType === "PAYMENT_REVERSAL") {
        const reversal = await tx.paymentReversal.update({
          where: { id: workflow.entityId },
          data: { approvalStatus: approved ? ApprovalStatus.Approved : ApprovalStatus.Rejected, approvedBy: actor.id, approvedAt: new Date(), decisionReason: input.comment ?? null },
          include: { payment: { include: { invoice: true } } }
        });
        if (approved) {
          const invoice = reversal.payment.invoice;
          const balance = Number(invoice.balance) + Number(reversal.payment.amount);
          const paid = Math.max(Number(invoice.amountPaid) - Number(reversal.payment.amount), 0);
          await tx.studentInvoice.update({
            where: { id: invoice.id },
            data: { balance, amountPaid: paid, status: paid === 0 ? "ISSUED" : "PARTIALLY_PAID", version: { increment: 1 } }
          });
        }
      }

      if (!approved && input.decision === "RETURNED_FOR_CORRECTION") {
        await tx.riskAlert.create({ data: { schoolId: actor.schoolId, category: "APPROVAL_RETURNED", severity: "LOW", entityType: workflow.entityType, entityId: workflow.entityId, userId: actor.id, reason: "Approval item returned for correction." } });
      }

      return updated;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: `APPROVAL_${input.decision}`, entityType: workflow.entityType, entityId: workflow.entityId, metadata: { workflowId: id, comment: input.comment } });
    return result;
  }
}
