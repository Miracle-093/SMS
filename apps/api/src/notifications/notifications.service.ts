import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { SyncStatus, type CurrentUser } from "@aethina/shared-types";
import { announcementSchema, notificationTemplateSchema } from "@aethina/validation";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  list(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.notification.findMany({
      where: { schoolId, deletedAt: null, recipientType: query.recipientType, recipientId: query.recipientId, status: query.status },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  templates(schoolId: string) {
    return this.prisma.notificationTemplate.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
  }

  async createTemplate(actor: CurrentUser, body: unknown) {
    const input = notificationTemplateSchema.parse(body);
    const template = await this.prisma.notificationTemplate.upsert({
      where: { schoolId_name_channel: { schoolId: actor.schoolId, name: input.name, channel: input.channel } },
      update: { subject: input.subject ?? null, body: input.body, variables: input.variables as Prisma.InputJsonValue, isActive: input.isActive },
      create: { schoolId: actor.schoolId, createdBy: actor.id, ...input, subject: input.subject ?? null, variables: input.variables as Prisma.InputJsonValue }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "NOTIFICATION_TEMPLATE_UPSERTED", entityType: "NOTIFICATION_TEMPLATE", entityId: template.id });
    return template;
  }

  async queue(actor: CurrentUser, body: { recipientType: string; recipientId?: string; channel?: string; category?: string; title: string; body: string; templateId?: string; payload?: unknown }) {
    const notification = await this.prisma.notification.create({
      data: {
        schoolId: actor.schoolId,
        createdBy: actor.id,
        recipientType: body.recipientType,
        recipientId: body.recipientId ?? null,
        channel: body.channel ?? "IN_APP",
        category: body.category ?? "GENERAL",
        templateId: body.templateId ?? null,
        payload: (body.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        title: body.title,
        body: body.body,
        status: "PENDING",
        syncStatus: SyncStatus.Synced,
        lastSyncedAt: new Date()
      }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "NOTIFICATION_QUEUED", entityType: "NOTIFICATION", entityId: notification.id });
    return notification;
  }

  async process(actor: CurrentUser, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!notification) throw new NotFoundException("Notification not found.");
    const updated = await this.prisma.notification.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), attemptCount: { increment: 1 }, lastError: null, version: { increment: 1 } } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "NOTIFICATION_SENT", entityType: "NOTIFICATION", entityId: id });
    return updated;
  }

  async markRead(schoolId: string, userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, schoolId, OR: [{ recipientId: userId }, { recipientType: "ALL" }] } });
    if (!notification) throw new NotFoundException("Notification not found.");
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date(), status: notification.status === "PENDING" ? "SENT" : notification.status } });
  }

  announcements(schoolId: string, query: Record<string, string | undefined>) {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        schoolId,
        deletedAt: null,
        audience: query.audience,
        classId: query.classId,
        publishAt: query.all === "true" ? undefined : { lte: now },
        OR: query.all === "true" ? undefined : [{ expiresAt: null }, { expiresAt: { gte: now } }]
      },
      orderBy: [{ priority: "desc" }, { publishAt: "desc" }]
    });
  }

  async createAnnouncement(actor: CurrentUser, body: unknown) {
    const input = announcementSchema.parse(body);
    const announcement = await this.prisma.announcement.create({
      data: { schoolId: actor.schoolId, createdBy: actor.id, ...input, classId: input.classId ?? null, streamId: input.streamId ?? null, academicYearId: input.academicYearId ?? null, publishAt: new Date(input.publishAt), expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "ANNOUNCEMENT_CREATED", entityType: "ANNOUNCEMENT", entityId: announcement.id });
    return announcement;
  }
}
