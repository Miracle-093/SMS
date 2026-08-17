import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { academicYearSchema, classSchema, gradeBoundarySchema, schoolProfileSchema, streamSchema, subjectSchema, termSchema } from "@aethina/validation";
import type { CurrentUser } from "@aethina/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";

@Injectable()
export class SchoolConfigService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async overview(schoolId: string) {
    const [school, academicYears, classes, subjects, gradeBoundaries] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } }),
      this.prisma.academicYear.findMany({ where: { schoolId }, include: { terms: true }, orderBy: { startsAt: "desc" } }),
      this.prisma.class.findMany({ where: { schoolId }, include: { streams: true }, orderBy: { level: "asc" } }),
      this.prisma.subject.findMany({ where: { schoolId }, orderBy: { name: "asc" } }),
      this.prisma.gradeBoundary.findMany({ where: { schoolId }, orderBy: { minScore: "desc" } })
    ]);
    return { school, academicYears, classes, subjects, gradeBoundaries };
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

  async createGradeBoundary(actor: CurrentUser, body: unknown) {
    const input = gradeBoundarySchema.parse(body);
    const record = await this.prisma.gradeBoundary.create({ data: { schoolId: actor.schoolId, ...input } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "GRADE_BOUNDARY_CREATED", entityType: "GRADE_BOUNDARY", entityId: record.id, newValue: record });
    return record;
  }
}
