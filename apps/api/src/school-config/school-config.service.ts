import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { academicYearSchema, classSchema, gradeBoundarySchema, schoolProfileSchema, streamSchema, subjectSchema, termSchema } from "@aethina/validation";
import type { CurrentUser } from "@aethina/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertClassLevelWithinAcademicScope, assertClassWithinAcademicLevelScope, classIdsForAcademicLevelScope } from "../common/academic-scope.js";

@Injectable()
export class SchoolConfigService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async overview(actor: CurrentUser) {
    const schoolId = actor.schoolId;
    const scopedClassIds = await classIdsForAcademicLevelScope(this.prisma, actor);
    const classWhere = scopedClassIds ? { schoolId, id: { in: scopedClassIds } } : { schoolId };
    const classAssignmentWhere = scopedClassIds ? { schoolId, isActive: true, classId: { in: scopedClassIds } } : { schoolId, isActive: true };
    const [school, academicYears, classes, subjects, gradeBoundaries] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } }),
      this.prisma.academicYear.findMany({ where: { schoolId }, include: { terms: true }, orderBy: { startsAt: "desc" } }),
      this.prisma.class.findMany({ where: classWhere, include: { streams: true }, orderBy: { level: "asc" } }),
      this.prisma.subject.findMany({ where: { schoolId }, include: { teacher: true }, orderBy: { name: "asc" } }),
      this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } })
    ]);
    const [teachers, teacherSubjectAssignments, classTeacherAssignments, academicScopeAssignments] = await Promise.all([
      this.prisma.teacher.findMany({ where: { schoolId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
      this.prisma.teacherSubjectAssignment.findMany({ where: classAssignmentWhere, include: { teacher: true }, orderBy: { createdAt: "desc" } }),
      this.prisma.classTeacherAssignment.findMany({ where: classAssignmentWhere, include: { teacher: true, class: true, stream: true, academicYear: true, term: true }, orderBy: { createdAt: "desc" } }),
      this.prisma.academicScopeAssignment.findMany({ where: { schoolId, isActive: true }, include: { user: { select: { id: true, displayName: true, email: true } } }, orderBy: [{ user: { displayName: "asc" } }, { band: "asc" }] })
    ]);
    return { school, academicYears, classes, subjects, gradeBoundaries, teachers, teacherSubjectAssignments, classTeacherAssignments, academicScopeAssignments };
  }

  async updateProfile(actor: CurrentUser, body: unknown) {
    const input = schoolProfileSchema.parse(body);
    const previous = await this.prisma.school.findUniqueOrThrow({ where: { id: actor.schoolId } });
    const school = await this.prisma.school.update({
      where: { id: actor.schoolId },
      data: input
    });
    await this.audit.record({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "SCHOOL_PROFILE_UPDATED",
      entityType: "SCHOOL",
      entityId: actor.schoolId,
      previousValue: previous,
      newValue: school
    });
    return school;
  }

  async createAcademicYear(actor: CurrentUser, body: unknown) {
    const input = academicYearSchema.parse(body);
    const year = await this.prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await tx.academicYear.updateMany({ where: { schoolId: actor.schoolId }, data: { isActive: false } });
      }
      const created = await tx.academicYear.create({ data: { schoolId: actor.schoolId, ...input, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) } });
      if (input.isActive) {
        await tx.school.update({ where: { id: actor.schoolId }, data: { currentAcademicYearId: created.id } });
      }
      return created;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "ACADEMIC_YEAR_CREATED", entityType: "ACADEMIC_YEAR", entityId: year.id, newValue: year });
    return year;
  }

  async createTerm(actor: CurrentUser, body: unknown) {
    const input = termSchema.parse(body);
    const year = await this.prisma.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: actor.schoolId } });
    if (!year) {
      throw new BadRequestException("Academic year does not belong to this school.");
    }
    if (new Date(input.startsAt) < year.startsAt || new Date(input.endsAt) > year.endsAt) {
      throw new BadRequestException("Term dates must fall inside the academic year.");
    }
    const term = await this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.term.updateMany({ where: { academicYear: { schoolId: actor.schoolId } }, data: { isCurrent: false } });
      }
      const created = await tx.term.create({ data: { ...input, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) } });
      if (input.isCurrent) {
        await tx.school.update({ where: { id: actor.schoolId }, data: { currentTermId: created.id, currentAcademicYearId: input.academicYearId } });
      }
      return created;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "TERM_CREATED", entityType: "TERM", entityId: term.id, newValue: term });
    return term;
  }

  async createClass(actor: CurrentUser, body: unknown) {
    const input = classSchema.parse(body);
    await assertClassLevelWithinAcademicScope(this.prisma, actor, input.level);
    const record = await this.prisma.class.create({ data: { schoolId: actor.schoolId, ...input } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "CLASS_CREATED", entityType: "CLASS", entityId: record.id, newValue: record });
    return record;
  }

  async createStream(actor: CurrentUser, body: unknown) {
    const input = streamSchema.parse(body);
    const klass = await this.prisma.class.findFirst({ where: { id: input.classId, schoolId: actor.schoolId } });
    if (!klass) {
      throw new BadRequestException("Class does not belong to this school.");
    }
    await assertClassWithinAcademicLevelScope(this.prisma, actor, input.classId);
    const record = await this.prisma.stream.create({ data: { schoolId: actor.schoolId, ...input } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "STREAM_CREATED", entityType: "STREAM", entityId: record.id, newValue: record });
    return record;
  }

  async createSubject(actor: CurrentUser, body: unknown) {
    const input = subjectSchema.parse(body);
    const record = await this.prisma.subject.create({ data: { schoolId: actor.schoolId, ...input } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "SUBJECT_CREATED", entityType: "SUBJECT", entityId: record.id, newValue: record });
    return record;
  }

  async createTeacherSubjectAssignment(actor: CurrentUser, body: unknown) {
    const input = body as { teacherId?: string; subjectId?: string; classId?: string; streamId?: string | null };
    if (!input.teacherId || !input.subjectId || !input.classId) throw new BadRequestException("Teacher, subject and class are required.");
    await assertClassWithinAcademicLevelScope(this.prisma, actor, input.classId);
    await this.validateAcademicOwnership(actor.schoolId, input.teacherId, input.subjectId, input.classId, input.streamId ?? null);
    const existing = await this.prisma.teacherSubjectAssignment.findFirst({
      where: { schoolId: actor.schoolId, teacherId: input.teacherId, subjectId: input.subjectId, classId: input.classId, streamId: input.streamId ?? null }
    });
    const record = existing
      ? await this.prisma.teacherSubjectAssignment.update({ where: { id: existing.id }, data: { isActive: true } })
      : await this.prisma.teacherSubjectAssignment.create({ data: { schoolId: actor.schoolId, teacherId: input.teacherId, subjectId: input.subjectId, classId: input.classId, streamId: input.streamId ?? null } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "TEACHER_SUBJECT_ASSIGNED", entityType: "TEACHER_SUBJECT_ASSIGNMENT", entityId: record.id, newValue: record });
    return record;
  }

  async createClassTeacherAssignment(actor: CurrentUser, body: unknown) {
    const input = body as { teacherId?: string; classId?: string; streamId?: string | null; academicYearId?: string; termId?: string | null };
    if (!input.teacherId || !input.classId || !input.academicYearId) throw new BadRequestException("Teacher, class and academic year are required.");
    await assertClassWithinAcademicLevelScope(this.prisma, actor, input.classId);
    await this.validateAcademicOwnership(actor.schoolId, input.teacherId, null, input.classId, input.streamId ?? null);
    const year = await this.prisma.academicYear.findFirst({ where: { id: input.academicYearId, schoolId: actor.schoolId } });
    if (!year) throw new BadRequestException("Academic year does not belong to this school.");
    if (input.termId) {
      const term = await this.prisma.term.findFirst({ where: { id: input.termId, academicYear: { schoolId: actor.schoolId } } });
      if (!term) throw new BadRequestException("Term does not belong to this school.");
    }
    const existing = await this.prisma.classTeacherAssignment.findFirst({
      where: { schoolId: actor.schoolId, teacherId: input.teacherId, classId: input.classId, streamId: input.streamId ?? null, academicYearId: input.academicYearId }
    });
    const record = existing
      ? await this.prisma.classTeacherAssignment.update({ where: { id: existing.id }, data: { termId: input.termId ?? null, isActive: true } })
      : await this.prisma.classTeacherAssignment.create({ data: { schoolId: actor.schoolId, teacherId: input.teacherId, classId: input.classId, streamId: input.streamId ?? null, academicYearId: input.academicYearId, termId: input.termId ?? null } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "CLASS_TEACHER_ASSIGNED", entityType: "CLASS_TEACHER_ASSIGNMENT", entityId: record.id, newValue: record });
    return record;
  }

  async createGradeBoundary(actor: CurrentUser, body: unknown) {
    const input = gradeBoundarySchema.parse(body);
    const record = await this.prisma.gradeBoundary.create({ data: { schoolId: actor.schoolId, ...input } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "GRADE_BOUNDARY_CREATED", entityType: "GRADE_BOUNDARY", entityId: record.id, newValue: record });
    return record;
  }

  private async validateAcademicOwnership(schoolId: string, teacherId: string, subjectId: string | null, classId: string, streamId: string | null) {
    const [teacher, subject, klass] = await Promise.all([
      this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } }),
      subjectId ? this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } }) : Promise.resolve(true),
      this.prisma.class.findFirst({ where: { id: classId, schoolId } })
    ]);
    if (!teacher || !subject || !klass) throw new BadRequestException("Teacher, subject and class must belong to this school.");
    if (streamId) {
      const stream = await this.prisma.stream.findFirst({ where: { id: streamId, classId } });
      if (!stream) throw new BadRequestException("Stream must belong to the selected class.");
    }
  }
}
