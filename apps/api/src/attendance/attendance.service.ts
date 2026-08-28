import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ApprovalStatus, CurrentUser, SyncStatus, TeacherAttendanceStatus } from "@aethina/shared-types";
import { AuditService } from "../audit/audit.service.js";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(schoolId: string, date?: string) {
    const occurredAt = date ? new Date(date) : new Date();
    const dayStart = new Date(occurredAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(occurredAt);
    dayEnd.setHours(23, 59, 59, 999);
    return this.prisma.teacherAttendance.findMany({
      where: { schoolId, attendanceDate: { gte: dayStart, lte: dayEnd }, deletedAt: null },
      include: { teacher: { select: { staffId: true, firstName: true, lastName: true } } },
      orderBy: [{ checkInAt: "asc" }, { createdAt: "asc" }]
    });
  }

  async correctionRequests(schoolId: string) {
    return this.prisma.teacherAttendance.findMany({
      where: { schoolId, approvalStatus: ApprovalStatus.Pending, deletedAt: null },
      include: { teacher: { select: { staffId: true, firstName: true, lastName: true } } },
      orderBy: { updatedAt: "desc" }
    });
  }

  async checkIn(input: { staffId: string; pin: string; deviceId: string; occurredAt: string }) {
    const teacher = await this.validateTeacherPin(input.staffId, input.pin);
    const occurredAt = new Date(input.occurredAt);
    const dayStart = new Date(occurredAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(occurredAt);
    dayEnd.setHours(23, 59, 59, 999);

    const existing = await this.prisma.teacherAttendance.findFirst({
      where: { teacherId: teacher.id, attendanceDate: { gte: dayStart, lte: dayEnd }, deletedAt: null }
    });
    if (existing?.checkInAt) {
      throw new BadRequestException("Teacher has already checked in for this date.");
    }

    const lateThreshold = new Date(occurredAt);
    lateThreshold.setHours(8, 0, 0, 0);

    return this.prisma.teacherAttendance.upsert({
      where: { teacherId_attendanceDate: { teacherId: teacher.id, attendanceDate: dayStart } },
      create: {
        schoolId: teacher.schoolId,
        teacherId: teacher.id,
        deviceId: input.deviceId,
        createdBy: teacher.userId,
        attendanceDate: dayStart,
        checkInAt: occurredAt,
        status: occurredAt > lateThreshold ? TeacherAttendanceStatus.Late : TeacherAttendanceStatus.CheckedIn,
        syncStatus: SyncStatus.Synced,
        approvalStatus: ApprovalStatus.Approved
      },
      update: {
        checkInAt: occurredAt,
        status: occurredAt > lateThreshold ? TeacherAttendanceStatus.Late : TeacherAttendanceStatus.CheckedIn,
        version: { increment: 1 }
      }
    });
  }

  async checkOut(input: { staffId: string; pin: string; deviceId: string; occurredAt: string }) {
    const teacher = await this.validateTeacherPin(input.staffId, input.pin);
    const occurredAt = new Date(input.occurredAt);
    const dayStart = new Date(occurredAt);
    dayStart.setHours(0, 0, 0, 0);

    const attendance = await this.prisma.teacherAttendance.findUnique({
      where: { teacherId_attendanceDate: { teacherId: teacher.id, attendanceDate: dayStart } }
    });
    if (!attendance?.checkInAt) {
      throw new BadRequestException("Teacher must check in before checking out.");
    }

    return this.prisma.teacherAttendance.update({
      where: { id: attendance.id },
      data: {
        checkOutAt: occurredAt,
        deviceId: input.deviceId,
        status: TeacherAttendanceStatus.CheckedOut,
        version: { increment: 1 }
      }
    });
  }

  async requestCorrection(id: string, input: { requestedBy: string; reason: string; requestedCheckInAt?: string; requestedCheckOutAt?: string }) {
    const attendance = await this.prisma.teacherAttendance.findUniqueOrThrow({ where: { id } });
    if (attendance.teacherId !== input.requestedBy || attendance.deletedAt) {
      throw new BadRequestException("Correction request does not match this teacher attendance record.");
    }
    return this.prisma.teacherAttendance.update({
      where: { id },
      data: {
        correctionRequestedBy: input.requestedBy,
        correctionReason: input.reason,
        requestedCheckInAt: input.requestedCheckInAt ? new Date(input.requestedCheckInAt) : null,
        requestedCheckOutAt: input.requestedCheckOutAt ? new Date(input.requestedCheckOutAt) : null,
        status: TeacherAttendanceStatus.CorrectionRequested,
        approvalStatus: ApprovalStatus.Pending,
        version: { increment: 1 }
      }
    });
  }

  async approveCorrection(user: CurrentUser, id: string) {
    const attendance = await this.prisma.teacherAttendance.findUniqueOrThrow({ where: { id } });
    if (attendance.schoolId !== user.schoolId) {
      throw new BadRequestException("Attendance record does not belong to this school.");
    }
    const updated = await this.prisma.teacherAttendance.update({
      where: { id },
      data: {
        checkInAt: attendance.requestedCheckInAt ?? attendance.checkInAt,
        checkOutAt: attendance.requestedCheckOutAt ?? attendance.checkOutAt,
        approvedBy: user.id,
        approvedAt: new Date(),
        status: TeacherAttendanceStatus.Corrected,
        approvalStatus: ApprovalStatus.Approved,
        version: { increment: 1 }
      }
    });
    await this.audit.record({
      schoolId: user.schoolId,
      actorId: user.id,
      action: "TEACHER_ATTENDANCE_CORRECTION_APPROVED",
      entityType: "TEACHER_ATTENDANCE",
      entityId: id,
      previousValue: attendance,
      newValue: updated
    });
    return updated;
  }

  async rejectCorrection(user: CurrentUser, id: string, reason?: string) {
    const attendance = await this.prisma.teacherAttendance.findUniqueOrThrow({ where: { id } });
    if (attendance.schoolId !== user.schoolId) {
      throw new BadRequestException("Attendance record does not belong to this school.");
    }
    const updated = await this.prisma.teacherAttendance.update({
      where: { id },
      data: {
        requestedCheckInAt: null,
        requestedCheckOutAt: null,
        approvedBy: user.id,
        approvedAt: new Date(),
        approvalStatus: ApprovalStatus.Rejected,
        version: { increment: 1 }
      }
    });
    await this.audit.record({
      schoolId: user.schoolId,
      actorId: user.id,
      action: "TEACHER_ATTENDANCE_CORRECTION_REJECTED",
      entityType: "TEACHER_ATTENDANCE",
      entityId: id,
      previousValue: attendance,
      newValue: updated,
      metadata: { reason: reason ?? null }
    });
    return updated;
  }

  private async validateTeacherPin(staffId: string, pin: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { staffId } });
    if (!teacher || !this.passwords.verify(pin, teacher.pinHash)) {
      throw new UnauthorizedException("Invalid staff ID or PIN.");
    }
    return teacher;
  }
}
