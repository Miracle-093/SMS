import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { passwordChangeSchema } from "@aethina/validation";
import type { CurrentUser } from "@aethina/shared-types";
import { AuditService } from "../audit/audit.service.js";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class PortalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PasswordService) private readonly passwords: PasswordService
  ) {}

  async home(user: CurrentUser) {
    const student = await this.student(user);
    const [finance, latestReport, announcements, notifications, timetable] = await Promise.all([
      this.finance(user),
      this.prisma.reportCard.findFirst({ where: { schoolId: user.schoolId, studentId: user.id, status: "PUBLISHED", deletedAt: null }, orderBy: { generatedAt: "desc" } }),
      this.announcements(user),
      this.notifications(user),
      this.timetable(user)
    ]);
    return { student, finance: finance.summary, latestReport, announcements: announcements.slice(0, 5), notifications: notifications.slice(0, 5), timetable: timetable.slice(0, 8) };
  }

  async finance(user: CurrentUser) {
    const invoices = await this.prisma.studentInvoice.findMany({
      where: { schoolId: user.schoolId, studentId: user.id, deletedAt: null },
      include: { lines: true, payments: { include: { receipt: true } }, adjustments: true, term: true },
      orderBy: { invoiceDate: "desc" }
    });
    return {
      summary: {
        expected: invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0),
        paid: invoices.reduce((sum, invoice) => sum + Number(invoice.amountPaid), 0),
        balance: invoices.reduce((sum, invoice) => sum + Number(invoice.balance), 0)
      },
      invoices
    };
  }

  academics(user: CurrentUser) {
    return this.prisma.student.findFirstOrThrow({
      where: { id: user.id, schoolId: user.schoolId },
      include: {
        marks: { where: { status: "PUBLISHED" }, include: { subject: true, assessment: { include: { examination: true } } }, orderBy: { updatedAt: "desc" } },
        reportCards: { where: { status: "PUBLISHED", deletedAt: null }, orderBy: { generatedAt: "desc" } }
      }
    });
  }

  async timetable(user: CurrentUser) {
    const student = await this.student(user);
    if (!student.currentClassId) throw new BadRequestException("Portal student is not assigned to a class.");
    const school = await this.prisma.school.findUnique({ where: { id: user.schoolId } });
    return this.prisma.timetableEntry.findMany({
      where: { schoolId: user.schoolId, deletedAt: null, termId: school?.currentTermId ?? undefined, classId: student.currentClassId, streamId: student.currentStreamId ?? undefined },
      orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }]
    });
  }

  async announcements(user: CurrentUser) {
    const student = await this.student(user);
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        publishAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        AND: [{
          OR: [
            { audience: { in: ["ALL", "PORTAL", "STUDENTS", "GUARDIANS"] } },
            { classId: student.currentClassId },
            { streamId: student.currentStreamId }
          ]
        }]
      },
      orderBy: [{ priority: "desc" }, { publishAt: "desc" }],
      take: 50
    });
  }

  notifications(user: CurrentUser) {
    return this.prisma.notification.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        OR: [{ recipientId: user.id }, { recipientType: { in: ["ALL", "PORTAL", "STUDENT"] } }]
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  async markNotificationRead(user: CurrentUser, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, schoolId: user.schoolId, OR: [{ recipientId: user.id }, { recipientType: { in: ["ALL", "PORTAL", "STUDENT"] } }] } });
    if (!notification) throw new NotFoundException("Notification not found.");
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async changePassword(user: CurrentUser, body: unknown) {
    const input = passwordChangeSchema.parse(body);
    const credential = await this.prisma.studentPortalCredential.findUnique({ where: { studentId: user.id } });
    if (!credential) throw new NotFoundException("Portal credential not found.");
    if (!this.passwords.verify(input.currentPassword, credential.passwordHash)) throw new UnauthorizedException("Current password is incorrect.");
    if (input.currentPassword === input.newPassword) throw new BadRequestException("New password must be different.");
    await this.prisma.studentPortalCredential.update({ where: { studentId: user.id }, data: { passwordHash: this.passwords.hash(input.newPassword), mustReset: false, failedLoginAttempts: 0, lockedUntil: null } });
    await this.audit.record({ schoolId: user.schoolId, actorId: user.id, action: "PORTAL_PASSWORD_CHANGED", entityType: "STUDENT", entityId: user.id });
    return { ok: true };
  }

  private student(user: CurrentUser) {
    return this.prisma.student.findFirstOrThrow({ where: { id: user.id, schoolId: user.schoolId, deletedAt: null }, include: { currentClass: true, currentStream: true, guardians: { include: { guardian: true } } } });
  }
}
