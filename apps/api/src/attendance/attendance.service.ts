import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApprovalStatus, CurrentUser, SyncStatus, TeacherAttendanceStatus } from "@aethina/shared-types";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService
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
    if (attendance.correctionRequestedBy) {
      throw new ConflictException("This attendance correction has already been decided.");
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

  async requestCorrection(id: string, input: { staffId: string; pin: string; reason: string; requestedCheckInAt?: string; requestedCheckOutAt?: string }) {
    const attendance = await this.prisma.teacherAttendance.findUniqueOrThrow({ where: { id } });
    const teacher = await this.validateTeacherPin(input.staffId, input.pin);
    if (attendance.teacherId !== teacher.id || attendance.deletedAt) {
      throw new BadRequestException("Correction request does not match this teacher attendance record.");
    }
    const claimed = await this.prisma.teacherAttendance.updateMany({
      where: { id, teacherId: teacher.id, deletedAt: null, correctionRequestedBy: null },
      data: {
        correctionRequestedBy: teacher.id,
        correctionReason: input.reason,
        requestedCheckInAt: input.requestedCheckInAt ? new Date(input.requestedCheckInAt) : null,
        requestedCheckOutAt: input.requestedCheckOutAt ? new Date(input.requestedCheckOutAt) : null,
        status: TeacherAttendanceStatus.CorrectionRequested,
        approvalStatus: ApprovalStatus.Pending,
        version: { increment: 1 }
      }
    });
    if (claimed.count === 0) {
      throw new ConflictException("This attendance correction has already been decided.");
    }
    return this.prisma.teacherAttendance.findUniqueOrThrow({ where: { id } });
  }

  async approveCorrection(user: CurrentUser, id: string) {
    return this.decideCorrection(user, id, "APPROVED");
  }

  async rejectCorrection(user: CurrentUser, id: string, reason?: string) {
    return this.decideCorrection(user, id, "REJECTED", reason);
  }

  private async decideCorrection(user: CurrentUser, id: string, decision: "APPROVED" | "REJECTED", reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.teacherAttendance.findUnique({ where: { id } });
      if (!attendance || attendance.schoolId !== user.schoolId || attendance.deletedAt) {
        throw new NotFoundException("Attendance correction was not found.");
      }

      const decisionTime = new Date();
      const claim = await tx.teacherAttendance.updateMany({
        where: { id, schoolId: user.schoolId, deletedAt: null, approvalStatus: ApprovalStatus.Pending, version: attendance.version },
        data: decision === "APPROVED"
          ? {
              checkInAt: attendance.requestedCheckInAt ?? attendance.checkInAt,
              checkOutAt: attendance.requestedCheckOutAt ?? attendance.checkOutAt,
              approvedBy: user.id,
              approvedAt: decisionTime,
              status: TeacherAttendanceStatus.Corrected,
              approvalStatus: ApprovalStatus.Approved,
              version: { increment: 1 }
            }
          : {
              requestedCheckInAt: null,
              requestedCheckOutAt: null,
              approvedBy: user.id,
              approvedAt: decisionTime,
              approvalStatus: ApprovalStatus.Rejected,
              version: { increment: 1 }
            }
      });
      if (claim.count === 0) {
        const current = await tx.teacherAttendance.findUnique({ where: { id }, select: { schoolId: true, deletedAt: true } });
        if (!current || current.schoolId !== user.schoolId || current.deletedAt) {
          throw new NotFoundException("Attendance correction was not found.");
        }
        throw new ConflictException("This attendance correction has already been decided.");
      }

      const updated = await tx.teacherAttendance.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: {
          schoolId: user.schoolId,
          actorId: user.id,
          createdBy: user.id,
          action: decision === "APPROVED" ? "TEACHER_ATTENDANCE_CORRECTION_APPROVED" : "TEACHER_ATTENDANCE_CORRECTION_REJECTED",
          entityType: "TEACHER_ATTENDANCE",
          entityId: id,
          previousValue: attendance as unknown as Prisma.InputJsonValue,
          newValue: updated as unknown as Prisma.InputJsonValue,
          metadata: decision === "REJECTED" ? { reason: reason ?? null } : Prisma.JsonNull
        }
      });
      return updated;
    });
  }

  private async validateTeacherPin(staffId: string, pin: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { staffId } });
    if (!teacher || !this.passwords.verify(pin, teacher.pinHash)) {
      throw new UnauthorizedException("Invalid staff ID or PIN.");
    }
    return teacher;
  }
}
