import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { studentPromotionSchema, studentRegistrationSchema } from "@aethina/validation";
import type { CurrentUser } from "@aethina/shared-types";
import { ApprovalStatus, PermissionKey, SyncStatus } from "@aethina/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { PasswordService } from "../auth/password.service.js";
import { assertClassWithinAcademicLevelScope, classIdsForAcademicLevelScope } from "../common/academic-scope.js";

@Injectable()
export class StudentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PasswordService) private readonly passwords: PasswordService
  ) {}

  async list(actor: CurrentUser, query: Record<string, string | undefined>) {
    const visibility = await this.studentVisibility(actor);
    return this.prisma.student.findMany({
      where: {
        schoolId: actor.schoolId,
        deletedAt: null,
        status: query.status as never,
        currentClassId: query.classId,
        currentStreamId: query.streamId,
        currentAcademicYearId: query.academicYearId,
        AND: visibility,
        OR: query.search
          ? [
              { admissionNo: { contains: query.search, mode: "insensitive" } },
              { firstName: { contains: query.search, mode: "insensitive" } },
              { middleName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } }
            ]
          : undefined
      },
      include: {
        currentClass: true,
        currentStream: true,
        guardians: { include: { guardian: true } },
        portalCredential: { select: { id: true, username: true, mustReset: true, isActive: true, lastLoginAt: true } },
        promotions: { orderBy: { promotionDate: "desc" } }
      },
      orderBy: [{ admissionNo: "asc" }]
    });
  }

  async profile(actor: CurrentUser, id: string) {
    const visibility = await this.studentVisibility(actor);
    return this.prisma.student.findFirstOrThrow({
      where: { schoolId: actor.schoolId, id, deletedAt: null, AND: visibility },
      include: {
        currentClass: true,
        currentStream: true,
        guardians: { include: { guardian: true } },
        portalCredential: { select: { id: true, username: true, mustReset: true, isActive: true, lastLoginAt: true } },
        promotions: { orderBy: { promotionDate: "desc" } }
      }
    });
  }

  async register(actor: CurrentUser, body: unknown) {
    const input = studentRegistrationSchema.parse(body);
    await assertClassWithinAcademicLevelScope(this.prisma, actor, input.currentClassId);
    return this.createRegistration(actor.schoolId, actor.id, body, null);
  }

  async previewRosterImport(actor: CurrentUser, body: unknown) {
    const input = parseRosterPreview(body);
    await this.assertRosterPreviewScope(actor, input.classId, input.streamId);

    const admissionNumbers = input.rows.map((row) => row.admissionNo).filter((value): value is string => Boolean(value));
    const existing = admissionNumbers.length
      ? await this.prisma.student.findMany({
          where: { schoolId: actor.schoolId, admissionNo: { in: admissionNumbers } },
          select: { admissionNo: true, firstName: true, lastName: true, currentClassId: true, currentStreamId: true }
        })
      : [];
    const existingByAdmission = new Map(existing.map((student) => [student.admissionNo.toUpperCase(), student]));
    const seenAdmissions = new Set<string>();
    const validRows: RosterPreviewRow[] = [];
    const errors: RosterPreviewError[] = [];

    input.rows.forEach((row, index) => {
      const rowErrors: string[] = [];
      if (!row.firstName) rowErrors.push("First name is required.");
      if (!row.lastName) rowErrors.push("Last name is required.");
      if (row.admissionNo) {
        const key = row.admissionNo.toUpperCase();
        if (seenAdmissions.has(key)) rowErrors.push("Admission number is repeated in this import.");
        seenAdmissions.add(key);
      }
      if (rowErrors.length) {
        errors.push({ rowNumber: index + 1, messages: rowErrors, row });
      } else {
        validRows.push(row);
      }
    });

    return {
      classId: input.classId,
      streamId: input.streamId,
      totalRows: input.rows.length,
      validRows,
      errors,
      existingMatches: validRows
        .filter((row) => row.admissionNo && existingByAdmission.has(row.admissionNo.toUpperCase()))
        .map((row) => ({ row, student: existingByAdmission.get(row.admissionNo!.toUpperCase()) })),
      mode: "PREVIEW_ONLY",
      nextStep: "Reviewed rows can be registered by DOS or an administrator with admissions permission."
    };
  }

  async createRegistration(schoolId: string, actorId: string | null, body: unknown, deviceId: string | null) {
    const input = studentRegistrationSchema.parse(body);
    if (input.schoolId !== schoolId) {
      throw new BadRequestException("Student school does not match authenticated school.");
    }
    await this.validatePlacement(schoolId, input.currentClassId, input.currentStreamId ?? null, input.currentAcademicYearId);
    const temporaryPassword = this.passwords.temporaryPassword();
    const result = await this.prisma.$transaction(async (tx) => {
      const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId } });
      const admissionNo = input.admissionNo?.trim() || `${school.admissionNumberPrefix ?? "ADM"}-${String(school.nextAdmissionSequence).padStart(4, "0")}`;
      const duplicate = await tx.student.findUnique({ where: { schoolId_admissionNo: { schoolId, admissionNo } } });
      if (duplicate) {
        throw new ConflictException("Admission number already exists.");
      }
      if (!input.admissionNo) {
        await tx.school.update({ where: { id: schoolId }, data: { nextAdmissionSequence: { increment: 1 } } });
      }
      const student = await tx.student.create({
        data: {
          id: input.id,
          schoolId,
          deviceId,
          createdBy: actorId,
          admissionNo,
          firstName: input.firstName,
          middleName: input.middleName ?? null,
          lastName: input.lastName,
          gender: input.gender,
          dateOfBirth: new Date(input.dateOfBirth),
          admissionDate: new Date(input.admissionDate),
          previousSchool: input.previousSchool ?? null,
          status: input.status,
          currentAcademicYearId: input.currentAcademicYearId,
          currentClassId: input.currentClassId,
          currentStreamId: input.currentStreamId ?? null,
          emergencyContact: input.emergencyContact,
          medicalNotes: input.medicalNotes ?? null,
          photoUrl: input.photoUrl ?? null,
          supportingDocuments: input.supportingDocuments as Prisma.InputJsonValue,
          notes: input.notes ?? null,
          syncStatus: SyncStatus.Synced,
          approvalStatus: ApprovalStatus.Approved,
          lastSyncedAt: new Date()
        }
      });
      const guardian = await tx.guardian.create({
        data: {
          schoolId,
          deviceId,
          createdBy: actorId,
          fullName: input.guardianFullName,
          phone: input.guardianPhone,
          email: input.guardianEmail ?? null,
          address: input.guardianAddress ?? null,
          syncStatus: SyncStatus.Synced,
          approvalStatus: ApprovalStatus.Approved,
          lastSyncedAt: new Date()
        }
      });
      await tx.studentGuardian.create({
        data: { studentId: student.id, guardianId: guardian.id, relationship: input.guardianRelationship, isPrimary: true }
      });
      const portal = await tx.studentPortalCredential.create({
        data: {
          studentId: student.id,
          username: admissionNo.toLowerCase(),
          passwordHash: this.passwords.hash(temporaryPassword),
          mustReset: true
        },
        select: { id: true, username: true, mustReset: true, isActive: true }
      });
      return { student, guardian, portal };
    });
    await this.audit.record({
      schoolId,
      actorId,
      deviceId,
      action: "STUDENT_CREATED",
      entityType: "STUDENT",
      entityId: result.student.id,
      newValue: { admissionNo: result.student.admissionNo, guardianId: result.guardian.id }
    });
    return { ...result, portalTemporaryPassword: temporaryPassword };
  }

  async update(actor: CurrentUser, id: string, body: unknown) {
    const input = studentRegistrationSchema.parse({ ...(body as Record<string, unknown>), id: undefined });
    await assertClassWithinAcademicLevelScope(this.prisma, actor, input.currentClassId);
    await this.validatePlacement(actor.schoolId, input.currentClassId, input.currentStreamId ?? null, input.currentAcademicYearId);
    const previous = await this.prisma.student.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!previous) {
      throw new NotFoundException("Student not found.");
    }
    if (input.admissionNo && input.admissionNo !== previous.admissionNo) {
      const duplicate = await this.prisma.student.findUnique({ where: { schoolId_admissionNo: { schoolId: actor.schoolId, admissionNo: input.admissionNo } } });
      if (duplicate) {
        throw new ConflictException("Admission number already exists.");
      }
    }
    const student = await this.prisma.student.update({
      where: { id },
      data: {
        admissionNo: input.admissionNo ?? previous.admissionNo,
        firstName: input.firstName,
        middleName: input.middleName ?? null,
        lastName: input.lastName,
        gender: input.gender,
        dateOfBirth: new Date(input.dateOfBirth),
        admissionDate: new Date(input.admissionDate),
        previousSchool: input.previousSchool ?? null,
        status: input.status,
        currentAcademicYearId: input.currentAcademicYearId,
        currentClassId: input.currentClassId,
        currentStreamId: input.currentStreamId ?? null,
        emergencyContact: input.emergencyContact,
        medicalNotes: input.medicalNotes ?? null,
        photoUrl: input.photoUrl ?? null,
        supportingDocuments: input.supportingDocuments as Prisma.InputJsonValue,
        notes: input.notes ?? null,
        version: { increment: 1 }
      }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "STUDENT_UPDATED", entityType: "STUDENT", entityId: id, previousValue: previous, newValue: student });
    return student;
  }

  async setActive(actor: CurrentUser, id: string, active: boolean) {
    const previous = await this.prisma.student.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!previous) {
      throw new NotFoundException("Student not found.");
    }
    const student = await this.prisma.student.update({
      where: { id },
      data: { status: active ? "ACTIVE" : "INACTIVE", deletedAt: null, version: { increment: 1 } }
    });
    await this.audit.record({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: active ? "STUDENT_ACTIVATED" : "STUDENT_DEACTIVATED",
      entityType: "STUDENT",
      entityId: id,
      previousValue: { status: previous.status },
      newValue: { status: student.status }
    });
    return student;
  }

  async resetPortalCredentials(actor: CurrentUser, id: string) {
    const student = await this.prisma.student.findFirst({ where: { id, schoolId: actor.schoolId }, include: { portalCredential: true } });
    if (!student?.portalCredential) {
      throw new NotFoundException("Student portal account not found.");
    }
    const temporaryPassword = this.passwords.temporaryPassword();
    const portal = await this.prisma.studentPortalCredential.update({
      where: { studentId: student.id },
      data: { passwordHash: this.passwords.hash(temporaryPassword), mustReset: true, failedLoginAttempts: 0, lockedUntil: null, isActive: true },
      select: { id: true, username: true, mustReset: true, isActive: true }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "PORTAL_CREDENTIAL_RESET", entityType: "STUDENT", entityId: id });
    return { portal, temporaryPassword };
  }

  async promote(actor: CurrentUser, body: unknown) {
    const input = studentPromotionSchema.parse(body);
    await assertClassWithinAcademicLevelScope(this.prisma, actor, input.previousClassId);
    await assertClassWithinAcademicLevelScope(this.prisma, actor, input.newClassId);
    const student = await this.prisma.student.findFirst({ where: { id: input.studentId, schoolId: actor.schoolId } });
    if (!student) {
      throw new NotFoundException("Student not found.");
    }
    const previousClass = await this.prisma.class.findFirst({ where: { id: input.previousClassId, schoolId: actor.schoolId } });
    const newClass = await this.prisma.class.findFirst({ where: { id: input.newClassId, schoolId: actor.schoolId } });
    if (!previousClass || !newClass) {
      throw new BadRequestException("Promotion classes must belong to this school.");
    }
    const promotion = await this.prisma.$transaction(async (tx) => {
      const record = await tx.studentPromotion.create({
        data: {
          schoolId: actor.schoolId,
          createdBy: actor.id,
          studentId: student.id,
          previousAcademicYearId: input.previousAcademicYearId,
          previousClassId: input.previousClassId,
          newAcademicYearId: input.newAcademicYearId,
          newClassId: input.newClassId,
          fromClassId: input.previousClassId,
          toClassId: input.newClassId,
          effectiveAt: new Date(input.promotionDate),
          promotionDate: new Date(input.promotionDate),
          promotedBy: actor.id,
          notes: input.notes ?? null,
          approvalStatus: ApprovalStatus.Approved,
          syncStatus: SyncStatus.Synced,
          lastSyncedAt: new Date()
        }
      });
      await tx.student.update({
        where: { id: student.id },
        data: { currentAcademicYearId: input.newAcademicYearId, currentClassId: input.newClassId, version: { increment: 1 } }
      });
      return record;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "STUDENT_PROMOTED", entityType: "STUDENT", entityId: student.id, previousValue: { classId: input.previousClassId, academicYearId: input.previousAcademicYearId }, newValue: { classId: input.newClassId, academicYearId: input.newAcademicYearId } });
    return promotion;
  }

  private async validatePlacement(schoolId: string, classId: string, streamId: string | null, academicYearId: string) {
    const [klass, year] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: classId, schoolId } }),
      this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } })
    ]);
    if (!klass || !year) {
      throw new BadRequestException("Class and academic year must belong to this school.");
    }
    if (streamId) {
      const stream = await this.prisma.stream.findFirst({ where: { id: streamId, classId } });
      if (!stream) {
        throw new BadRequestException("Stream must belong to the selected class.");
      }
    }
  }

  private async assertRosterPreviewScope(actor: CurrentUser, classId: string, streamId: string | null) {
    await this.validateClassStream(actor.schoolId, classId, streamId);
    const scopedClassIds = await classIdsForAcademicLevelScope(this.prisma, actor);
    if (scopedClassIds && !scopedClassIds.includes(classId)) {
      throw new BadRequestException("This class is outside your academic office scope.");
    }
    const permissions = new Set(actor.permissions);
    if (
      permissions.has(PermissionKey.AdmissionsManage) ||
      permissions.has(PermissionKey.AcademicSetupManage)
    ) {
      return;
    }
    if (scopedClassIds) return;
    const school = await this.prisma.school.findUnique({ where: { id: actor.schoolId } });
    const teacher = await this.prisma.teacher.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id } });
    if (!teacher) {
      throw new BadRequestException("Only assigned teachers can preview class rosters.");
    }
    const streamCondition = streamId ? [{ streamId }, { streamId: null }] : [{ streamId: null }];
    const [subjectAssignment, classAssignment] = await Promise.all([
      this.prisma.teacherSubjectAssignment.findFirst({
        where: { schoolId: actor.schoolId, teacherId: teacher.id, classId, isActive: true, OR: streamCondition }
      }),
      this.prisma.classTeacherAssignment.findFirst({
        where: {
          schoolId: actor.schoolId,
          teacherId: teacher.id,
          classId,
          isActive: true,
          ...(school?.currentAcademicYearId ? { academicYearId: school.currentAcademicYearId } : {}),
          AND: [
            { OR: streamCondition },
            school?.currentTermId ? { OR: [{ termId: null }, { termId: school.currentTermId }] } : {}
          ]
        }
      })
    ]);
    if (!subjectAssignment && !classAssignment) {
      throw new BadRequestException("This roster is outside your assigned class or subject workspace.");
    }
  }

  private async validateClassStream(schoolId: string, classId: string, streamId: string | null) {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!klass) {
      throw new BadRequestException("Class must belong to this school.");
    }
    if (streamId) {
      const stream = await this.prisma.stream.findFirst({ where: { id: streamId, classId, schoolId } });
      if (!stream) {
        throw new BadRequestException("Stream must belong to the selected class.");
      }
    }
  }

  private async studentVisibility(actor: CurrentUser): Promise<Prisma.StudentWhereInput[]> {
    const permissions = new Set(actor.permissions);
    const scopedClassIds = await classIdsForAcademicLevelScope(this.prisma, actor);
    if (scopedClassIds) return scopedClassIds.length ? [{ currentClassId: { in: scopedClassIds } }] : [{ id: "__no_students_for_academic_scope__" }];
    const canSeeWholeSchool =
      permissions.has(PermissionKey.AdmissionsManage) ||
      permissions.has(PermissionKey.AcademicSetupManage) ||
      permissions.has(PermissionKey.FinanceRead) ||
      permissions.has(PermissionKey.FinanceManage) ||
      permissions.has(PermissionKey.ApprovalReview) ||
      permissions.has(PermissionKey.RiskReview);
    if (canSeeWholeSchool) return [];
    const teacher = await this.prisma.teacher.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id } });
    if (!teacher) return [{ id: "__no_students_for_user__" }];
    const [subjectAssignments, classAssignments] = await Promise.all([
      this.prisma.teacherSubjectAssignment.findMany({ where: { schoolId: actor.schoolId, teacherId: teacher.id, isActive: true } }),
      this.prisma.classTeacherAssignment.findMany({ where: { schoolId: actor.schoolId, teacherId: teacher.id, isActive: true } })
    ]);
    const ownership = [...subjectAssignments, ...classAssignments].map((assignment) => ({
      currentClassId: assignment.classId,
      ...(assignment.streamId ? { currentStreamId: assignment.streamId } : {})
    }));
    return ownership.length ? [{ OR: ownership }] : [{ id: "__no_students_for_user__" }];
  }
}

type RosterPreviewRow = {
  admissionNo?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
};

type RosterPreviewError = {
  rowNumber: number;
  messages: string[];
  row: RosterPreviewRow;
};

function parseRosterPreview(body: unknown): { classId: string; streamId: string | null; rows: RosterPreviewRow[] } {
  const input = body as { classId?: unknown; streamId?: unknown; rows?: unknown };
  if (typeof input?.classId !== "string" || !input.classId) {
    throw new BadRequestException("Choose a class before previewing a roster import.");
  }
  if (!Array.isArray(input.rows)) {
    throw new BadRequestException("Roster import preview expects a list of rows.");
  }
  if (input.rows.length === 0) {
    throw new BadRequestException("Add at least one student row to preview.");
  }
  if (input.rows.length > 200) {
    throw new BadRequestException("Preview up to 200 student rows at a time.");
  }
  return {
    classId: input.classId.trim(),
    streamId: typeof input.streamId === "string" && input.streamId.trim() ? input.streamId.trim() : null,
    rows: input.rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        admissionNo: text(record.admissionNo),
        firstName: text(record.firstName) ?? "",
        middleName: text(record.middleName),
        lastName: text(record.lastName) ?? ""
      };
    })
  };
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
