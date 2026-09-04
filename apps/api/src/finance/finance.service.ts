import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus, CurrentUser, InvoiceStatus, SyncStatus } from "@aethina/shared-types";
import {
  adjustmentSchema,
  budgetRequestSchema,
  budgetSchema,
  expenseSchema,
  feeStructureSchema,
  financialSettingsSchema,
  invoiceGenerationSchema,
  manualInvoiceSchema,
  paymentSchema,
  reversalRequestSchema
} from "@aethina/validation";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

type Tx = Prisma.TransactionClient;

@Injectable()
export class FinanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async overview(schoolId: string, query: Record<string, string | undefined>) {
    const termId = await this.resolveTermId(schoolId, query.termId);
    const invoiceWhere = { schoolId, deletedAt: null, ...(termId ? { termId } : {}) };
    const [invoices, payments, adjustments, expenses, budgets] = await Promise.all([
      this.prisma.studentInvoice.aggregate({ where: invoiceWhere, _sum: { amount: true, amountPaid: true, balance: true, adjustmentTotal: true } }),
      this.prisma.payment.aggregate({ where: { schoolId, deletedAt: null, ...(query.from || query.to ? { paidAt: this.dateRange(query) } : {}) }, _sum: { amount: true } }),
      this.prisma.feeAdjustment.aggregate({ where: { schoolId, deletedAt: null, approvalStatus: ApprovalStatus.Approved }, _sum: { amount: true } }),
      this.prisma.expense.aggregate({ where: { schoolId, deletedAt: null, approvalStatus: ApprovalStatus.Approved, ...(query.from || query.to ? { spentAt: this.dateRange(query) } : {}) }, _sum: { amount: true } }),
      this.prisma.budget.findMany({ where: { schoolId, deletedAt: null }, orderBy: [{ year: "desc" }, { name: "asc" }] })
    ]);
    const expected = money(invoices._sum.amount);
    const collected = money(invoices._sum.amountPaid) || money(payments._sum.amount);
    const outstanding = money(invoices._sum.balance);
    const discounts = money(invoices._sum.adjustmentTotal) || money(adjustments._sum.amount);
    const expenseTotal = money(expenses._sum.amount);
    return {
      termId,
      expectedFees: expected,
      collectedFees: collected,
      outstandingFees: outstanding,
      collectionPercentage: expected ? Math.round((collected / expected) * 100) : 0,
      discounts,
      expenses: expenseTotal,
      netCashMovement: collected - expenseTotal,
      budgets: budgets.map((budget) => ({
        ...budget,
        remainingAmount: money(budget.amount) - money(budget.spentAmount),
        utilizationPercentage: money(budget.amount) ? Math.round((money(budget.spentAmount) / money(budget.amount)) * 100) : 0
      }))
    };
  }

  feeStructures(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.feeStructure.findMany({
      where: {
        schoolId,
        academicYearId: query.academicYearId,
        termId: query.termId,
        classId: query.classId,
        isActive: query.active === undefined ? undefined : query.active === "true"
      },
      include: { class: true },
      orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }]
    });
  }

  async createFeeStructure(actor: CurrentUser, body: unknown) {
    const input = feeStructureSchema.parse(body);
    const duplicate = await this.prisma.feeStructure.findFirst({
      where: {
        schoolId: actor.schoolId,
        academicYearId: input.academicYearId ?? null,
        termId: input.termId ?? null,
        classId: input.classId,
        category: input.category,
        name: input.name
      }
    });
    if (duplicate) throw new ConflictException("A matching fee structure already exists.");
    const fee = await this.prisma.feeStructure.create({
      data: {
        schoolId: actor.schoolId,
        academicYearId: input.academicYearId ?? null,
        termId: input.termId ?? null,
        classId: input.classId,
        category: input.category,
        name: input.name,
        description: input.description ?? null,
        amount: input.amount,
        isMandatory: input.isMandatory,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        isActive: input.isActive
      }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "FEE_STRUCTURE_CREATED", entityType: "FEE_STRUCTURE", entityId: fee.id, newValue: fee });
    return fee;
  }

  invoices(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.studentInvoice.findMany({
      where: {
        schoolId,
        deletedAt: null,
        studentId: query.studentId,
        termId: query.termId,
        status: query.status,
        student: query.search
          ? {
              OR: [
                { admissionNo: { contains: query.search, mode: "insensitive" } },
                { firstName: { contains: query.search, mode: "insensitive" } },
                { lastName: { contains: query.search, mode: "insensitive" } }
              ]
            }
          : undefined
      },
      include: { student: { include: { currentClass: true } }, lines: true, payments: { include: { receipt: true, reversals: true } }, adjustments: true },
      orderBy: { invoiceDate: "desc" },
      take: 200
    });
  }

  async generateInvoices(actor: CurrentUser, body: unknown) {
    const input = invoiceGenerationSchema.parse(body);
    const fees = await this.prisma.feeStructure.findMany({
      where: { schoolId: actor.schoolId, termId: input.termId, classId: input.classId ?? undefined, isActive: true },
      include: { class: true }
    });
    if (!fees.length) throw new BadRequestException("No active fee structures match the selected term and class.");
    const students = await this.prisma.student.findMany({
      where: { schoolId: actor.schoolId, status: "ACTIVE", deletedAt: null, currentClassId: input.classId ?? { in: fees.map((fee) => fee.classId) } }
    });
    const created = [];
    for (const student of students) {
      for (const fee of fees.filter((item) => item.classId === student.currentClassId)) {
        const existing = await this.prisma.studentInvoice.findFirst({ where: { schoolId: actor.schoolId, studentId: student.id, termId: input.termId, feeStructureId: fee.id, deletedAt: null } });
        if (existing) continue;
        const dueDate = input.dueDate ? new Date(input.dueDate) : fee.dueDate ?? new Date();
        const invoice = await this.withNumberRetry("invoiceNo", async () => this.prisma.$transaction(async (tx) => {
          const invoiceNo = await this.nextNumber(actor.schoolId, "INV", "studentInvoice", "invoiceNo", tx);
          const row = await tx.studentInvoice.create({
            data: {
              schoolId: actor.schoolId,
              studentId: student.id,
              termId: input.termId,
              feeStructureId: fee.id,
              invoiceNo,
              dueDate,
              amount: fee.amount,
              balance: fee.amount,
              status: InvoiceStatus.Issued,
              createdBy: actor.id,
              syncStatus: SyncStatus.Synced,
              lastSyncedAt: new Date()
            }
          });
          await tx.studentInvoiceLine.create({ data: { invoiceId: row.id, description: fee.name, category: fee.category, amount: fee.amount } });
          return row;
        }));
        created.push(invoice);
      }
    }
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "INVOICES_GENERATED", entityType: "TERM", entityId: input.termId, newValue: { created: created.length } });
    return { created: created.length, invoices: created };
  }

  async createManualInvoice(actor: CurrentUser, body: unknown) {
    const input = manualInvoiceSchema.parse(body);
    const [student, term, fee] = await Promise.all([
      this.prisma.student.findFirst({ where: { id: input.studentId, schoolId: actor.schoolId, deletedAt: null } }),
      this.prisma.term.findFirst({ where: { id: input.termId, academicYear: { schoolId: actor.schoolId } } }),
      this.prisma.feeStructure.findFirst({ where: { id: input.feeStructureId, schoolId: actor.schoolId, isActive: true } })
    ]);
    if (!student || !term || !fee) throw new BadRequestException("Invoice student, term, and fee structure must belong to this school.");
    if (fee.classId !== student.currentClassId) throw new BadRequestException("Fee structure does not match the student's current class.");
    const total = input.lines.reduce((sum, line) => sum + line.amount, 0);
    const invoice = await this.withNumberRetry("invoiceNo", async () => this.prisma.$transaction(async (tx) => {
      const invoiceNo = await this.nextNumber(actor.schoolId, "INV", "studentInvoice", "invoiceNo", tx);
      const row = await tx.studentInvoice.create({
        data: {
          schoolId: actor.schoolId,
          studentId: input.studentId,
          termId: input.termId,
          feeStructureId: input.feeStructureId,
          invoiceNo,
          dueDate: new Date(input.dueDate),
          amount: total,
          balance: total,
          status: InvoiceStatus.Issued,
          createdBy: actor.id,
          syncStatus: SyncStatus.Synced,
          lastSyncedAt: new Date()
        }
      });
      await tx.studentInvoiceLine.createMany({ data: input.lines.map((line) => ({ invoiceId: row.id, ...line })) });
      return row;
    }));
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "INVOICE_CREATED", entityType: "INVOICE", entityId: invoice.id, newValue: invoice });
    return invoice;
  }

  async recordPayment(actor: CurrentUser, body: unknown, syncDeviceId?: string | null) {
    const input = paymentSchema.parse(body);
    const result = await this.withNumberRetry("receiptNo", async () => this.prisma.$transaction(async (tx) => {
      const invoice = await tx.studentInvoice.findFirst({ where: { id: input.invoiceId, schoolId: actor.schoolId, deletedAt: null }, include: { student: true } });
      if (!invoice) throw new NotFoundException("Invoice not found.");
      if (invoice.status === InvoiceStatus.Cancelled) throw new BadRequestException("Cancelled invoices cannot receive payments.");
      const balance = money(invoice.balance);
      if (input.amount > balance) throw new BadRequestException("Payment exceeds outstanding invoice balance.");
      if (input.reference) {
        const duplicate = await tx.payment.findFirst({ where: { schoolId: actor.schoolId, reference: input.reference, deletedAt: null } });
        if (duplicate) throw new ConflictException("Payment reference already exists.");
      }
      const receiptNo = await this.nextNumber(actor.schoolId, "RCT", "payment", "receiptNo", tx);
      const newPaid = money(invoice.amountPaid) + input.amount;
      const newBalance = Math.max(balance - input.amount, 0);
      const status = newBalance === 0 ? InvoiceStatus.Paid : InvoiceStatus.PartiallyPaid;
      const previousBalance = balance;
      const payment = await tx.payment.create({
        data: {
          id: input.id,
          schoolId: actor.schoolId,
          invoiceId: invoice.id,
          receiptNo,
          amount: input.amount,
          method: input.method,
          reference: input.reference ?? input.offlineReceiptNo ?? null,
          notes: input.notes ?? null,
          receivedBy: input.receivedBy ?? actor.displayName,
          paidAt: new Date(input.paidAt),
          createdBy: actor.id,
          deviceId: syncDeviceId ?? input.deviceId ?? null,
          syncStatus: SyncStatus.Synced,
          lastSyncedAt: new Date()
        }
      });
      await tx.studentInvoice.update({ where: { id: invoice.id }, data: { amountPaid: newPaid, balance: newBalance, status, version: { increment: 1 } } });
      const receipt = await tx.receipt.create({
        data: { schoolId: actor.schoolId, paymentId: payment.id, receiptNo, displayNo: receiptNo, amountWords: amountWords(input.amount) }
      });
      await this.createPaymentRiskAlerts(tx, actor, payment, input.amount);
      return { payment, receipt, previousBalance, remainingBalance: newBalance, student: invoice.student };
    }));
    await this.audit.record({
      schoolId: actor.schoolId,
      actorId: actor.id,
      deviceId: syncDeviceId ?? null,
      action: "PAYMENT_CREATED",
      entityType: "PAYMENT",
      entityId: result.payment.id,
      newValue: { amount: input.amount, receiptNo: result.receipt.receiptNo, remainingBalance: result.remainingBalance }
    });
    return result;
  }

  async receipt(schoolId: string, id: string) {
    return this.prisma.receipt.findFirstOrThrow({
      where: { id, schoolId },
      include: { payment: { include: { invoice: { include: { student: { include: { currentClass: true } } } } } } }
    });
  }

  async reprintReceipt(actor: CurrentUser, id: string) {
    const existing = await this.prisma.receipt.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!existing) throw new NotFoundException("Receipt not found.");
    const receipt = await this.prisma.receipt.update({ where: { id }, data: { reprintCount: { increment: 1 }, printedAt: new Date() } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "RECEIPT_REPRINTED", entityType: "RECEIPT", entityId: id });
    return receipt;
  }

  async requestReversal(actor: CurrentUser, body: unknown) {
    const input = reversalRequestSchema.parse(body);
    const payment = await this.prisma.payment.findFirst({ where: { id: input.paymentId, schoolId: actor.schoolId, deletedAt: null } });
    if (!payment) throw new NotFoundException("Payment not found.");
    const existingApproved = await this.prisma.paymentReversal.findFirst({ where: { paymentId: payment.id, deletedAt: null, approvalStatus: ApprovalStatus.Approved } });
    if (existingApproved) throw new ConflictException("This payment has already been reversed.");
    const existingPending = await this.prisma.paymentReversal.findFirst({ where: { paymentId: payment.id, deletedAt: null, approvalStatus: ApprovalStatus.Pending } });
    if (existingPending) throw new ConflictException("A reversal request is already pending for this payment.");
    const reversal = await this.prisma.paymentReversal.create({
      data: { schoolId: actor.schoolId, paymentId: payment.id, requestedBy: actor.id, createdBy: actor.id, reason: input.reason, approvalStatus: ApprovalStatus.Pending }
    });
    await this.prisma.approvalWorkflow.create({
      data: { schoolId: actor.schoolId, entityType: "PAYMENT_REVERSAL", entityId: reversal.id, requestedBy: actor.id, status: "SUBMITTED" }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "PAYMENT_REVERSAL_REQUESTED", entityType: "PAYMENT_REVERSAL", entityId: reversal.id, newValue: reversal });
    return reversal;
  }

  async decideReversal(actor: CurrentUser, id: string, approved: boolean, comment?: string | null) {
    const reversal = await this.prisma.paymentReversal.findFirst({ where: { id, schoolId: actor.schoolId }, include: { payment: { include: { invoice: true } } } });
    if (!reversal) throw new NotFoundException("Reversal request not found.");
    if (reversal.requestedBy === actor.id) throw new BadRequestException("Requester cannot approve their own reversal.");
    if (reversal.approvalStatus !== ApprovalStatus.Pending) throw new ConflictException("Reversal has already been decided.");
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentReversal.update({
        where: { id },
        data: { approvalStatus: approved ? ApprovalStatus.Approved : ApprovalStatus.Rejected, approvedBy: actor.id, approvedAt: new Date(), decisionReason: comment ?? null }
      });
      await tx.approvalWorkflow.updateMany({ where: { entityType: "PAYMENT_REVERSAL", entityId: id }, data: { status: approved ? "APPROVED" : "REJECTED", decision: approved ? "APPROVED" : "REJECTED", decisionDate: new Date(), comment: comment ?? null } });
      if (approved) {
        const invoice = reversal.payment.invoice;
        const balance = money(invoice.balance) + money(reversal.payment.amount);
        const paid = Math.max(money(invoice.amountPaid) - money(reversal.payment.amount), 0);
        await tx.studentInvoice.update({
          where: { id: invoice.id },
          data: { balance, amountPaid: paid, status: paid === 0 ? InvoiceStatus.Issued : InvoiceStatus.PartiallyPaid, version: { increment: 1 } }
        });
        await tx.riskAlert.create({
          data: { schoolId: actor.schoolId, category: "REVERSAL", severity: money(reversal.payment.amount) >= 250000 ? "HIGH" : "MEDIUM", entityType: "PAYMENT_REVERSAL", entityId: id, amount: reversal.payment.amount, userId: actor.id, reason: "Payment reversal approved; review for accounting correctness." }
        });
      }
      return updated;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: approved ? "PAYMENT_REVERSAL_APPROVED" : "PAYMENT_REVERSAL_REJECTED", entityType: "PAYMENT_REVERSAL", entityId: id, metadata: { comment } });
    return result;
  }

  async createAdjustment(actor: CurrentUser, body: unknown) {
    const input = adjustmentSchema.parse(body);
    const settings = await this.settings(actor.schoolId);
    const requiresApproval = input.amount >= money(settings.feeWaiverApprovalThreshold);
    const adjustment = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.studentInvoice.findFirst({ where: { id: input.invoiceId, schoolId: actor.schoolId, studentId: input.studentId, deletedAt: null } });
      if (!invoice) throw new NotFoundException("Invoice not found for this student.");
      if (invoice.status === InvoiceStatus.Cancelled) throw new BadRequestException("Cancelled invoices cannot receive adjustments.");
      if (input.amount > money(invoice.balance)) throw new BadRequestException("Adjustment exceeds outstanding invoice balance.");
      const row = await tx.feeAdjustment.create({
        data: {
          schoolId: actor.schoolId,
          studentId: input.studentId,
          invoiceId: input.invoiceId,
          adjustmentType: input.adjustmentType,
          amount: input.amount,
          percentage: input.percentage ?? null,
          reason: input.reason,
          notes: input.notes ?? null,
          requestedBy: actor.id,
          createdBy: actor.id,
          approvalStatus: requiresApproval ? ApprovalStatus.Pending : ApprovalStatus.Approved,
          approvedBy: requiresApproval ? null : actor.id,
          approvedAt: requiresApproval ? null : new Date()
        }
      });
      if (requiresApproval) {
        await tx.approvalWorkflow.create({ data: { schoolId: actor.schoolId, entityType: "FEE_ADJUSTMENT", entityId: row.id, requestedBy: actor.id, status: "SUBMITTED" } });
      } else {
        await this.applyAdjustment(tx, actor.schoolId, input.invoiceId, input.amount);
      }
      if (input.amount >= money(settings.feeWaiverApprovalThreshold)) {
        await tx.riskAlert.create({ data: { schoolId: actor.schoolId, category: "EXCESSIVE_WAIVER", severity: "HIGH", entityType: "FEE_ADJUSTMENT", entityId: row.id, amount: input.amount, userId: actor.id, reason: "Large discount or waiver reached approval/risk threshold." } });
      }
      return row;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "FEE_ADJUSTMENT_CREATED", entityType: "FEE_ADJUSTMENT", entityId: adjustment.id, newValue: adjustment });
    return adjustment;
  }

  budgets(schoolId: string) {
    return this.prisma.budget.findMany({ where: { schoolId, deletedAt: null }, include: { requests: true }, orderBy: [{ year: "desc" }, { department: "asc" }] });
  }

  async createBudget(actor: CurrentUser, body: unknown) {
    const input = budgetSchema.parse(body);
    const settings = await this.settings(actor.schoolId);
    if (input.amount > money(settings.maximumDepartmentBudget)) throw new BadRequestException("Budget exceeds configured department maximum.");
    if (input.academicYearId) {
      const year = await this.prisma.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: actor.schoolId } });
      if (!year) throw new BadRequestException("Academic year must belong to this school.");
    }
    if (input.termId) await this.assertTerm(actor.schoolId, input.termId);
    const budget = await this.prisma.budget.create({ data: { schoolId: actor.schoolId, createdBy: actor.id, ...input, academicYearId: input.academicYearId ?? null, termId: input.termId ?? null, period: input.period ?? null } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "BUDGET_CREATED", entityType: "BUDGET", entityId: budget.id, newValue: budget });
    return budget;
  }

  async createBudgetRequest(actor: CurrentUser, body: unknown) {
    const input = budgetRequestSchema.parse(body);
    const request = await this.prisma.$transaction(async (tx) => {
      const budget = await tx.budget.findFirst({ where: { id: input.budgetId, schoolId: actor.schoolId, deletedAt: null } });
      if (!budget) throw new NotFoundException("Budget not found.");
      if (input.amount > money(budget.amount) - money(budget.committedAmount) - money(budget.spentAmount) && budget.hardCap) {
        await tx.riskAlert.create({ data: { schoolId: actor.schoolId, category: "BUDGET_VIOLATION", severity: "HIGH", entityType: "BUDGET", entityId: budget.id, amount: input.amount, userId: actor.id, reason: "Budget request exceeds available budget." } });
        throw new BadRequestException("Budget request exceeds available budget.");
      }
      const row = await tx.budgetRequest.create({ data: { schoolId: actor.schoolId, budgetId: input.budgetId, requestedBy: actor.id, createdBy: actor.id, amount: input.amount, reason: input.reason } });
      await tx.approvalWorkflow.create({ data: { schoolId: actor.schoolId, entityType: "BUDGET_REQUEST", entityId: row.id, requestedBy: actor.id, status: "SUBMITTED" } });
      return row;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "BUDGET_REQUEST_SUBMITTED", entityType: "BUDGET_REQUEST", entityId: request.id, newValue: request });
    return request;
  }

  expenses(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.expense.findMany({ where: { schoolId, deletedAt: null, department: query.department, approvalStatus: query.status as never }, orderBy: { spentAt: "desc" }, take: 200 });
  }

  async createExpense(actor: CurrentUser, body: unknown) {
    const input = expenseSchema.parse(body);
    const settings = await this.settings(actor.schoolId);
    const requiresApproval = input.amount >= money(settings.maximumTransactionNoApproval) || input.amount >= money(settings.maximumSingleExpense);
    const result = await this.withNumberRetry("expenseNo", async () => this.prisma.$transaction(async (tx) => {
      if (input.reference) {
        const duplicate = await tx.expense.findFirst({ where: { schoolId: actor.schoolId, reference: input.reference, deletedAt: null } });
        if (duplicate) throw new ConflictException("Expense reference already exists.");
      }
      const budget = input.budgetId ? await tx.budget.findFirst({ where: { id: input.budgetId, schoolId: actor.schoolId, deletedAt: null } }) : null;
      if (input.budgetId && !budget) throw new NotFoundException("Budget not found.");
      if (input.requestedBy) {
        const requester = await tx.user.findFirst({ where: { id: input.requestedBy, schoolId: actor.schoolId, isActive: true } });
        if (!requester) throw new BadRequestException("Expense requester must belong to this school.");
      }
      if (budget && input.amount > money(budget.amount) - money(budget.spentAmount) && budget.hardCap) {
        await tx.riskAlert.create({ data: { schoolId: actor.schoolId, category: "BUDGET_VIOLATION", severity: "HIGH", entityType: "BUDGET", entityId: budget.id, amount: input.amount, userId: actor.id, reason: "Expense exceeds remaining budget." } });
        throw new BadRequestException("Expense exceeds remaining budget.");
      }
      const expenseNo = await this.nextNumber(actor.schoolId, "EXP", "expense", "expenseNo", tx);
      const expense = await tx.expense.create({
        data: {
          id: input.id,
          schoolId: actor.schoolId,
          createdBy: actor.id,
          deviceId: input.deviceId ?? null,
          expenseNo,
          spentAt: new Date(input.spentAt),
          category: input.category,
          department: input.department ?? null,
          description: input.description,
          amount: input.amount,
          method: input.method ?? null,
          payee: input.payee ?? null,
          reference: input.reference ?? null,
          requestedBy: input.requestedBy ?? actor.id,
          supportingDocument: input.supportingDocument ?? null,
          budgetId: input.budgetId ?? null,
          notes: input.notes ?? null,
          approvalStatus: requiresApproval ? ApprovalStatus.Pending : ApprovalStatus.Approved,
          syncStatus: SyncStatus.Synced,
          lastSyncedAt: new Date()
        }
      });
      if (requiresApproval) {
        await tx.approvalWorkflow.create({ data: { schoolId: actor.schoolId, entityType: "EXPENSE", entityId: expense.id, requestedBy: actor.id, status: "SUBMITTED" } });
      } else if (budget) {
        await tx.budget.update({ where: { id: budget.id }, data: { spentAmount: { increment: input.amount }, version: { increment: 1 } } });
      }
      await this.createExpenseRiskAlerts(tx, actor, expense, settings);
      return expense;
    }));
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "EXPENSE_CREATED", entityType: "EXPENSE", entityId: result.id, newValue: result });
    return result;
  }

  async studentFinanceProfile(schoolId: string, studentId: string, query: Record<string, string | undefined>) {
    const invoices = await this.prisma.studentInvoice.findMany({
      where: { schoolId, studentId, deletedAt: null, termId: query.termId },
      include: { lines: true, payments: { include: { receipt: true, reversals: true } }, adjustments: true, term: true },
      orderBy: { invoiceDate: "desc" }
    });
    return {
      studentId,
      totalExpected: invoices.reduce((sum, invoice) => sum + money(invoice.amount), 0),
      totalPaid: invoices.reduce((sum, invoice) => sum + money(invoice.amountPaid), 0),
      outstandingBalance: invoices.reduce((sum, invoice) => sum + money(invoice.balance), 0),
      invoices
    };
  }

  async settings(schoolId: string) {
    return this.prisma.financialSetting.upsert({ where: { schoolId }, update: {}, create: { schoolId } });
  }

  async updateSettings(actor: CurrentUser, body: unknown) {
    const input = financialSettingsSchema.parse(body);
    const previous = await this.settings(actor.schoolId);
    const settings = await this.prisma.financialSetting.update({ where: { schoolId: actor.schoolId }, data: input });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "FINANCIAL_SETTINGS_UPDATED", entityType: "FINANCIAL_SETTING", entityId: settings.id, previousValue: previous, newValue: settings });
    return settings;
  }

  async report(schoolId: string, type: string, query: Record<string, string | undefined>) {
    if (type === "collections") return this.overview(schoolId, query);
    if (type === "balances") {
      return this.prisma.studentInvoice.findMany({ where: { schoolId, deletedAt: null, termId: query.termId }, include: { student: { include: { currentClass: true } } }, orderBy: [{ balance: "desc" }] });
    }
    if (type === "payments") {
      return this.prisma.payment.findMany({ where: { schoolId, deletedAt: null, ...(query.from || query.to ? { paidAt: this.dateRange(query) } : {}) }, include: { receipt: true, reversals: true, invoice: { include: { student: true } } }, orderBy: { paidAt: "desc" } });
    }
    if (type === "daily-collections") {
      const start = query.date ? new Date(`${query.date}T00:00:00.000Z`) : new Date(new Date().toISOString().slice(0, 10));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      const payments = await this.prisma.payment.groupBy({ by: ["method"], where: { schoolId, deletedAt: null, paidAt: { gte: start, lt: end } }, _sum: { amount: true } });
      return { date: start.toISOString().slice(0, 10), total: payments.reduce((sum, row) => sum + money(row._sum.amount), 0), methods: payments };
    }
    if (type === "expenses") return this.expenses(schoolId, query);
    if (type === "budget-performance") return this.budgets(schoolId);
    throw new NotFoundException("Report type not found.");
  }

  private async applyAdjustment(tx: Tx, schoolId: string, invoiceId: string, amount: number) {
    const invoice = await tx.studentInvoice.findFirstOrThrow({ where: { id: invoiceId, schoolId } });
    const newAdjustment = money(invoice.adjustmentTotal) + amount;
    const newBalance = Math.max(money(invoice.balance) - amount, 0);
    await tx.studentInvoice.update({ where: { id: invoiceId }, data: { adjustmentTotal: newAdjustment, balance: newBalance, status: newBalance === 0 ? InvoiceStatus.Paid : invoice.status, version: { increment: 1 } } });
  }

  private async resolveTermId(schoolId: string, termId?: string) {
    if (termId) return termId;
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    return school?.currentTermId ?? undefined;
  }

  private async assertTerm(schoolId: string, termId: string) {
    return this.prisma.term.findFirstOrThrow({ where: { id: termId, academicYear: { schoolId } } });
  }

  private dateRange(query: Record<string, string | undefined>) {
    return { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) };
  }

  private async nextNumber(schoolId: string, prefix: string, modelName: "studentInvoice" | "payment" | "expense", field: "invoiceNo" | "receiptNo" | "expenseNo", tx?: Tx) {
    const db = tx ?? this.prisma;
    const year = new Date().getUTCFullYear();
    const count = await (db[modelName] as any).count({ where: { schoolId } });
    return `${prefix}-${year}-${String(count + 1).padStart(5, "0")}`;
  }

  private async withNumberRetry<T>(field: "invoiceNo" | "receiptNo" | "expenseNo", operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isUniqueConstraintOn(error, field) || attempt === 4) throw error;
      }
    }
    throw new ConflictException(`Could not allocate a unique ${field}. Please retry.`);
  }

  private async createPaymentRiskAlerts(tx: Tx, actor: CurrentUser, payment: { id: string; reference: string | null; paidAt: Date }, amount: number) {
    const settings = await tx.financialSetting.upsert({ where: { schoolId: actor.schoolId }, update: {}, create: { schoolId: actor.schoolId } });
    if (amount >= money(settings.maximumTransactionNoApproval)) {
      await tx.riskAlert.create({ data: { schoolId: actor.schoolId, category: "APPROVAL_THRESHOLD", severity: "MEDIUM", entityType: "PAYMENT", entityId: payment.id, amount, userId: actor.id, reason: "Payment is above the configured transaction monitoring threshold." } });
    }
    if (payment.reference) {
      const recentSimilar = await tx.payment.count({ where: { schoolId: actor.schoolId, reference: payment.reference, id: { not: payment.id } } });
      if (recentSimilar > 0) {
        await tx.riskAlert.create({ data: { schoolId: actor.schoolId, category: "DUPLICATE_TRANSACTION", severity: "HIGH", entityType: "PAYMENT", entityId: payment.id, amount, userId: actor.id, reason: "Duplicate payment reference detected." } });
      }
    }
  }

  private async createExpenseRiskAlerts(tx: Tx, actor: CurrentUser, expense: { id: string; amount: Prisma.Decimal; category: string; payee: string | null; spentAt: Date }, settings: { maximumSingleExpense: Prisma.Decimal; maximumTransactionNoApproval: Prisma.Decimal }) {
    const amount = money(expense.amount);
    if (amount >= money(settings.maximumSingleExpense)) {
      await tx.riskAlert.create({ data: { schoolId: actor.schoolId, category: "LARGE_EXPENSE", severity: "HIGH", entityType: "EXPENSE", entityId: expense.id, amount, userId: actor.id, reason: "Expense exceeds configured single-expense threshold." } });
    }
    if (expense.payee) {
      const dayStart = new Date(expense.spentAt);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      const nearby = await tx.expense.aggregate({ where: { schoolId: actor.schoolId, payee: expense.payee, category: expense.category, spentAt: { gte: dayStart, lt: dayEnd }, id: { not: expense.id } }, _sum: { amount: true }, _count: true });
      if (nearby._count > 0 && money(nearby._sum.amount) + amount >= money(settings.maximumTransactionNoApproval)) {
        await tx.riskAlert.create({ data: { schoolId: actor.schoolId, category: "TRANSACTION_SPLITTING", severity: "MEDIUM", entityType: "EXPENSE", entityId: expense.id, amount, userId: actor.id, reason: "Multiple same-day expenses to the same payee/category may indicate threshold splitting." } });
      }
    }
  }
}

function money(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "object" && "toNumber" in value ? value.toNumber() : Number(value);
}

function isUniqueConstraintOn(error: unknown, field: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? "").includes(field);
}

function amountWords(amount: number): string {
  return `UGX ${Math.round(amount).toLocaleString("en-UG")} only`;
}
