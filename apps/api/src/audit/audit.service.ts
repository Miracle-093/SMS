import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(schoolId: string, query: { action?: string; entityType?: string; take?: string }) {
    const take = Math.min(Math.max(Number(query.take ?? 50) || 50, 1), 100);
    return this.prisma.auditLog.findMany({
      where: {
        schoolId,
        deletedAt: null,
        ...(query.action ? { action: { contains: query.action, mode: "insensitive" as const } } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {})
      },
      orderBy: { createdAt: "desc" },
      take
    });
  }

  async record(input: {
    schoolId: string;
    actorId?: string | null;
    deviceId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    previousValue?: unknown;
    newValue?: unknown;
    metadata?: unknown;
  }) {
    return this.prisma.auditLog.create({
      data: {
        schoolId: input.schoolId,
        actorId: input.actorId ?? null,
        createdBy: input.actorId ?? null,
        deviceId: input.deviceId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        previousValue: (input.previousValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        newValue: (input.newValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue
      }
    });
  }
}
