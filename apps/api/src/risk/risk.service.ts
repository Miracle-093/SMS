import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CurrentUser } from "@aethina/shared-types";
import { riskReviewSchema } from "@aethina/validation";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class RiskService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  list(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.riskAlert.findMany({
      where: {
        schoolId,
        status: query.status,
        severity: query.severity,
        category: query.category
      },
      orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
      take: 100
    });
  }

  async review(actor: CurrentUser, id: string, body: unknown) {
    const input = riskReviewSchema.parse(body);
    const previous = await this.prisma.riskAlert.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!previous) throw new NotFoundException("Risk alert not found.");
    const alert = await this.prisma.riskAlert.update({
      where: { id },
      data: {
        status: input.status,
        notes: input.notes ?? previous.notes,
        reviewedBy: actor.id,
        reviewedAt: new Date()
      }
    });
    await this.audit.record({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "RISK_ALERT_REVIEWED",
      entityType: "RISK_ALERT",
      entityId: id,
      previousValue: { status: previous.status, notes: previous.notes },
      newValue: { status: alert.status, notes: alert.notes }
    });
    return alert;
  }
}
