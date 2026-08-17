import { Inject, Injectable } from "@nestjs/common";
import { ConflictSensitivity, CurrentUser, SyncEntityType, SyncStatus } from "@aethina/shared-types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { StudentsService } from "../students/students.service.js";
import { FinanceService } from "../finance/finance.service.js";

const sensitiveEntities = new Set<string>([
  SyncEntityType.Payment,
  SyncEntityType.PaymentReversal,
  SyncEntityType.Expense,
  SyncEntityType.BudgetRequest,
  SyncEntityType.InventoryItem,
  SyncEntityType.StockMovement,
  SyncEntityType.PayrollRecord
]);

const modelByEntityType: Record<string, keyof PrismaService> = {
  [SyncEntityType.TeacherAttendance]: "teacherAttendance",
  [SyncEntityType.Student]: "student",
  [SyncEntityType.Guardian]: "guardian",
  [SyncEntityType.Payment]: "payment",
  [SyncEntityType.PaymentReversal]: "paymentReversal",
  [SyncEntityType.BudgetRequest]: "budgetRequest",
  [SyncEntityType.InventoryItem]: "inventoryItem",
  [SyncEntityType.StockMovement]: "stockMovement",
  [SyncEntityType.PayrollRecord]: "payrollRecord",
  [SyncEntityType.AssessmentMark]: "mark"
};

@Injectable()
export class SyncService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(FinanceService) private readonly finance: FinanceService
  ) {}

  async push(input: {
    deviceId: string;
    schoolId: string;
    changes: Array<{
      id: string;
      entityType: string;
      entityId: string;
      operation: "CREATE" | "UPDATE" | "DELETE";
      payload: Record<string, unknown>;
      baseVersion: number | null;
      createdAt: string;
      retryCount: number;
    }>;
  }) {
    const results = [];

    for (const change of input.changes) {
      const existingRecord = await this.prisma.synchronizationRecord.findUnique({ where: { id: change.id } });
      if (existingRecord) {
        results.push({
          id: existingRecord.id,
          entityType: existingRecord.entityType,
          entityId: existingRecord.entityId,
          status: existingRecord.status,
          duplicate: true
        });
        continue;
      }

      const record = await this.prisma.synchronizationRecord.create({
        data: {
          id: change.id,
          schoolId: input.schoolId,
          deviceId: input.deviceId,
          entityType: change.entityType,
          entityId: change.entityId,
          operation: change.operation,
          payload: change.payload as Prisma.InputJsonObject,
          baseVersion: change.baseVersion,
          retryCount: change.retryCount
        }
      });

      results.push(await this.applyChange(record));
    }

    return { accepted: results.filter((result) => result.status === SyncStatus.Synced).length, results };
  }

  async pull(input: { deviceId: string; schoolId: string; since: string | null }) {
    const since = input.since ? new Date(input.since) : new Date(0);
    const [students, guardians, teacherAttendance, payments, inventoryItems, stockMovements, payrollRecords, budgetRequests, marks] = await Promise.all([
      this.prisma.student.findMany({ where: { schoolId: input.schoolId, updatedAt: { gt: since } } }),
      this.prisma.guardian.findMany({ where: { schoolId: input.schoolId, updatedAt: { gt: since } } }),
      this.prisma.teacherAttendance.findMany({ where: { schoolId: input.schoolId, updatedAt: { gt: since } } }),
      this.prisma.payment.findMany({ where: { schoolId: input.schoolId, updatedAt: { gt: since } } }),
      this.prisma.inventoryItem.findMany({ where: { schoolId: input.schoolId, updatedAt: { gt: since } } }),
      this.prisma.stockMovement.findMany({ where: { schoolId: input.schoolId, updatedAt: { gt: since } } }),
      this.prisma.payrollRecord.findMany({ where: { schoolId: input.schoolId, updatedAt: { gt: since } } }),
      this.prisma.budgetRequest.findMany({ where: { schoolId: input.schoolId, updatedAt: { gt: since } } }),
      this.prisma.mark.findMany({ where: { schoolId: input.schoolId, updatedAt: { gt: since } } })
    ]);

    return {
      pulledAt: new Date().toISOString(),
      records: { students, guardians, teacherAttendance, payments, inventoryItems, stockMovements, payrollRecords, budgetRequests, marks }
    };
  }

  async retryFailed(schoolId: string, deviceId: string) {
    const failed = await this.prisma.synchronizationRecord.findMany({
      where: { schoolId, deviceId, status: SyncStatus.Failed },
      orderBy: { createdAt: "asc" },
      take: 100
    });
    const results = [];
    for (const record of failed) {
      await this.prisma.synchronizationRecord.update({ where: { id: record.id }, data: { retryCount: { increment: 1 } } });
      results.push(await this.applyChange(record));
    }
    return { retried: results.length, results };
  }

  async conflicts(schoolId: string) {
    return this.prisma.synchronizationConflict.findMany({
      where: { schoolId, status: "OPEN" },
      orderBy: [{ sensitivity: "desc" }, { createdAt: "desc" }]
    });
  }

  async resolveConflict(user: CurrentUser, id: string) {
    const conflict = await this.prisma.synchronizationConflict.findUniqueOrThrow({ where: { id } });
    if (conflict.schoolId !== user.schoolId) {
      throw new Error("Synchronization conflict does not belong to this school.");
    }
    return this.prisma.synchronizationConflict.update({
      where: { id },
      data: { status: "RESOLVED", administratorId: user.id, resolvedAt: new Date() }
    });
  }

  async rejectConflict(user: CurrentUser, id: string) {
    const conflict = await this.prisma.synchronizationConflict.findUniqueOrThrow({ where: { id } });
    if (conflict.schoolId !== user.schoolId) {
      throw new Error("Synchronization conflict does not belong to this school.");
    }
    return this.prisma.synchronizationConflict.update({
      where: { id },
      data: { status: "REJECTED", administratorId: user.id, resolvedAt: new Date() }
    });
  }

  private async applyChange(record: {
    id: string;
    schoolId: string;
    deviceId: string;
    entityType: string;
    entityId: string;
    operation: string;
    payload: unknown;
    baseVersion: number | null;
  }) {
    const modelName = modelByEntityType[record.entityType];
    if (record.entityType === SyncEntityType.Student && typeof record.payload === "object" && record.payload && "registration" in record.payload) {
      try {
        const actorId = (record.payload as { createdBy?: string | null }).createdBy ?? null;
        if (record.operation === "CREATE") {
          await this.students.createRegistration(record.schoolId, actorId, (record.payload as { registration: unknown }).registration, record.deviceId);
        } else if (actorId) {
          await this.students.update({
            id: actorId,
            schoolId: record.schoolId,
            email: "offline-sync@aethina.local",
            displayName: "Offline Sync",
            roles: ["OFFLINE_SYNC"],
            permissions: [],
            mustChangePassword: false
          }, record.entityId, (record.payload as { registration: unknown }).registration);
        }
        await this.prisma.synchronizationRecord.update({ where: { id: record.id }, data: { status: SyncStatus.Synced, processedAt: new Date() } });
        return { id: record.id, entityType: record.entityType, entityId: record.entityId, status: SyncStatus.Synced };
      } catch (error) {
        return this.fail(record.id, error instanceof Error ? error.message : "Unknown student registration sync failure");
      }
    }

    if (!modelName) {
      return this.fail(record.id, `Unsupported sync entity type: ${record.entityType}`);
    }

    const model = this.prisma[modelName] as any;
    const server = await model.findUnique({ where: { id: record.entityId } });
    const payload = record.payload as Record<string, unknown>;

    if (server && record.baseVersion !== null && server.version !== record.baseVersion) {
      const sensitivity = sensitiveEntities.has(record.entityType) ? ConflictSensitivity.Sensitive : ConflictSensitivity.Normal;
      await this.prisma.synchronizationConflict.create({
        data: {
          schoolId: record.schoolId,
          deviceId: record.deviceId,
          entityType: record.entityType,
          entityId: record.entityId,
          localVersion: record.baseVersion,
          serverVersion: server.version,
          localPayload: payload as Prisma.InputJsonObject,
          serverPayload: server as Prisma.InputJsonObject,
          sensitivity,
          reason: sensitiveEntities.has(record.entityType)
            ? "Sensitive financial, payroll, budget, or inventory record requires administrator review."
            : "Version conflict detected."
        }
      });
      await this.prisma.synchronizationRecord.update({ where: { id: record.id }, data: { status: SyncStatus.Conflict, processedAt: new Date() } });
      return { id: record.id, entityType: record.entityType, entityId: record.entityId, status: SyncStatus.Conflict, sensitivity };
    }

    try {
      if (record.operation === "CREATE" && record.entityType === SyncEntityType.Payment) {
        const actor = await this.syncActor(record.schoolId, (payload.createdBy as string | undefined) ?? null);
        await this.finance.recordPayment(actor, { ...payload, id: record.entityId, deviceId: record.deviceId, offlineReceiptNo: payload.receiptNo }, record.deviceId);
        await this.prisma.synchronizationRecord.update({ where: { id: record.id }, data: { status: SyncStatus.Synced, processedAt: new Date() } });
        return { id: record.id, entityType: record.entityType, entityId: record.entityId, status: SyncStatus.Synced };
      }

      if (record.operation === "CREATE" && record.entityType === SyncEntityType.Expense) {
        const actor = await this.syncActor(record.schoolId, (payload.createdBy as string | undefined) ?? null);
        await this.finance.createExpense(actor, { ...payload, id: record.entityId, deviceId: record.deviceId });
        await this.prisma.synchronizationRecord.update({ where: { id: record.id }, data: { status: SyncStatus.Synced, processedAt: new Date() } });
        return { id: record.id, entityType: record.entityType, entityId: record.entityId, status: SyncStatus.Synced };
      }

      if (record.operation === "DELETE") {
        await model.update({ where: { id: record.entityId }, data: { deletedAt: new Date(), version: { increment: 1 }, syncStatus: SyncStatus.Synced } });
      } else if (server) {
        await model.update({ where: { id: record.entityId }, data: { ...payload, version: { increment: 1 }, syncStatus: SyncStatus.Synced, lastSyncedAt: new Date() } });
      } else {
        await model.create({ data: { ...payload, id: record.entityId, schoolId: record.schoolId, deviceId: record.deviceId, syncStatus: SyncStatus.Synced, lastSyncedAt: new Date() } });
      }
      await this.prisma.synchronizationRecord.update({ where: { id: record.id }, data: { status: SyncStatus.Synced, processedAt: new Date() } });
      return { id: record.id, entityType: record.entityType, entityId: record.entityId, status: SyncStatus.Synced };
    } catch (error) {
      return this.fail(record.id, error instanceof Error ? error.message : "Unknown sync failure");
    }
  }

  private async fail(id: string, error: string) {
    await this.prisma.synchronizationRecord.update({ where: { id }, data: { status: SyncStatus.Failed, error, processedAt: new Date() } });
    return { id, status: SyncStatus.Failed, error };
  }

  private async syncActor(schoolId: string, actorId: string | null): Promise<CurrentUser> {
    if (actorId) {
      const user = await this.prisma.user.findFirst({ where: { id: actorId, schoolId } });
      if (user) {
        return {
          id: user.id,
          schoolId,
          email: user.email,
          displayName: user.displayName,
          roles: ["OFFLINE_SYNC"],
          permissions: [],
          mustChangePassword: false
        };
      }
    }
    return {
      id: "offline-sync",
      schoolId,
      email: "offline-sync@aethina.local",
      displayName: "Offline Sync",
      roles: ["OFFLINE_SYNC"],
      permissions: [],
      mustChangePassword: false
    };
  }
}
