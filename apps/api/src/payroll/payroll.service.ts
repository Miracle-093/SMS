import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus, SyncStatus, type CurrentUser } from "@aethina/shared-types";
import { payrollComponentSchema, payrollProfileSchema, payrollRunSchema } from "@aethina/validation";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class PayrollService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  profiles(schoolId: string) {
    return this.prisma.payrollProfile.findMany({ where: { schoolId, deletedAt: null }, include: { components: true }, orderBy: { employeeNo: "asc" } });
  }

  async createProfile(actor: CurrentUser, body: unknown) {
    const input = payrollProfileSchema.parse(body);
    const profile = await this.prisma.payrollProfile.upsert({
      where: { schoolId_teacherId: { schoolId: actor.schoolId, teacherId: input.teacherId } },
      update: { ...input, department: input.department ?? null, paymentMethod: input.paymentMethod ?? null, paymentAccount: input.paymentAccount ?? null, effectiveAt: new Date(input.effectiveAt) },
      create: { schoolId: actor.schoolId, createdBy: actor.id, ...input, department: input.department ?? null, paymentMethod: input.paymentMethod ?? null, paymentAccount: input.paymentAccount ?? null, effectiveAt: new Date(input.effectiveAt) }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "PAYROLL_PROFILE_UPSERTED", entityType: "PAYROLL_PROFILE", entityId: profile.id, newValue: profile });
    return profile;
  }

  async createComponent(actor: CurrentUser, body: unknown) {
    const input = payrollComponentSchema.parse(body);
    const profile = await this.prisma.payrollProfile.findFirst({ where: { id: input.payrollProfileId, schoolId: actor.schoolId, deletedAt: null } });
    if (!profile) throw new NotFoundException("Payroll profile not found.");
    return this.prisma.payrollComponent.create({ data: { schoolId: actor.schoolId, ...input, effectiveAt: new Date(input.effectiveAt) } });
  }

  runs(schoolId: string) {
    return this.prisma.payrollRun.findMany({ where: { schoolId, deletedAt: null }, orderBy: { period: "desc" } });
  }

  async createRun(actor: CurrentUser, body: unknown) {
    const input = payrollRunSchema.parse(body);
    const existing = await this.prisma.payrollRun.findUnique({ where: { schoolId_period: { schoolId: actor.schoolId, period: input.period } } });
    if (existing) throw new ConflictException("Payroll run already exists for this period.");
    const run = await this.prisma.payrollRun.create({ data: { schoolId: actor.schoolId, period: input.period, notes: input.notes ?? null, createdBy: actor.id } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "PAYROLL_RUN_CREATED", entityType: "PAYROLL_RUN", entityId: run.id });
    return run;
  }

  async calculate(actor: CurrentUser, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!run) throw new NotFoundException("Payroll run not found.");
    if (run.status !== "DRAFT") throw new BadRequestException("Only draft payroll runs can be recalculated.");
    const profiles = await this.prisma.payrollProfile.findMany({ where: { schoolId: actor.schoolId, isActive: true, deletedAt: null }, include: { components: true } });
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.payrollRecord.deleteMany({ where: { schoolId: actor.schoolId, payrollRunId: id, status: "DRAFT" } });
      let grossTotal = 0;
      let deductionTotal = 0;
      for (const profile of profiles) {
        const earnings = profile.components.filter((item) => item.componentType === "EARNING" && item.isActive).reduce((sum, item) => sum + money(item.amount), 0);
        const deductions = profile.components.filter((item) => item.componentType === "DEDUCTION" && item.isActive).reduce((sum, item) => sum + money(item.amount), 0);
        const gross = money(profile.baseSalary) + earnings;
        const net = gross - deductions;
        grossTotal += gross;
        deductionTotal += deductions;
        await tx.payrollRecord.create({
          data: {
            schoolId: actor.schoolId,
            payrollRunId: id,
            payrollProfileId: profile.id,
            teacherId: profile.teacherId,
            period: run.period,
            grossPay: gross,
            deductions,
            netPay: net,
            paymentMethod: profile.paymentMethod,
            paymentAccount: profile.paymentAccount,
            createdBy: actor.id,
            status: "DRAFT",
            approvalStatus: ApprovalStatus.Pending,
            syncStatus: SyncStatus.Synced,
            lastSyncedAt: new Date()
          }
        });
      }
      return tx.payrollRun.update({ where: { id }, data: { grossTotal, deductionTotal, netTotal: grossTotal - deductionTotal } });
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "PAYROLL_RUN_CALCULATED", entityType: "PAYROLL_RUN", entityId: id, metadata: { staff: profiles.length } });
    return result;
  }

  records(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.payrollRecord.findMany({ where: { schoolId, payrollRunId: query.payrollRunId, period: query.period, status: query.status, deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  async submit(actor: CurrentUser, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!run) throw new NotFoundException("Payroll run not found.");
    if (run.status !== "DRAFT") throw new BadRequestException("Only draft payroll runs can be submitted.");
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.approvalWorkflow.upsert({ where: { entityId: id }, update: { status: "SUBMITTED", requestedBy: actor.id }, create: { schoolId: actor.schoolId, entityType: "PAYROLL_RUN", entityId: id, requestedBy: actor.id, status: "SUBMITTED" } });
      await tx.payrollRecord.updateMany({ where: { payrollRunId: id }, data: { status: "SUBMITTED" } });
      return tx.payrollRun.update({ where: { id }, data: { status: "SUBMITTED", submittedBy: actor.id, submittedAt: new Date() } });
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "PAYROLL_RUN_SUBMITTED", entityType: "PAYROLL_RUN", entityId: id });
    return updated;
  }

  async approve(actor: CurrentUser, id: string, approved: boolean) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!run) throw new NotFoundException("Payroll run not found.");
    if (run.submittedBy === actor.id) throw new BadRequestException("Submitter cannot approve their own payroll run.");
    if (run.status !== "SUBMITTED") throw new BadRequestException("Only submitted payroll runs can be approved.");
    const status = approved ? "APPROVED" : "REJECTED";
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.payrollRecord.updateMany({ where: { payrollRunId: id }, data: { status, approvalStatus: approved ? ApprovalStatus.Approved : ApprovalStatus.Rejected } });
      await tx.approvalWorkflow.updateMany({ where: { entityType: "PAYROLL_RUN", entityId: id }, data: { status, decision: status, decisionDate: new Date() } });
      return tx.payrollRun.update({ where: { id }, data: { status, approvedBy: actor.id, approvedAt: new Date() } });
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: `PAYROLL_RUN_${status}`, entityType: "PAYROLL_RUN", entityId: id });
    return updated;
  }

  async process(actor: CurrentUser, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!run) throw new NotFoundException("Payroll run not found.");
    if (run.status !== "APPROVED") throw new BadRequestException("Only approved payroll runs can be processed.");
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.payrollRecord.updateMany({ where: { payrollRunId: id }, data: { status: "PROCESSED", processedAt: new Date() } });
      return tx.payrollRun.update({ where: { id }, data: { status: "PROCESSED", processedAt: new Date() } });
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "PAYROLL_RUN_PROCESSED", entityType: "PAYROLL_RUN", entityId: id });
    return updated;
  }

  payslip(schoolId: string, id: string) {
    return this.prisma.payrollRecord.findFirstOrThrow({ where: { id, schoolId, deletedAt: null } });
  }
}

function money(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "object" && "toNumber" in value ? value.toNumber() : Number(value);
}
