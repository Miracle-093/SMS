import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { type CurrentUser } from "@aethina/shared-types";
import { PermissionKey } from "@aethina/shared-types";
import { timetableEntrySchema } from "@aethina/validation";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertClassWithinAcademicLevelScope, classIdsForAcademicLevelScope } from "../common/academic-scope.js";

@Injectable()
export class TimetableService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(actor: CurrentUser, query: Record<string, string | undefined>) {
    const teacherScope = await this.teacherScope(actor);
    const scopedClassIds = await classIdsForAcademicLevelScope(this.prisma, actor);
    const filters = cleanTimetableQuery(query);
    const school = await this.prisma.school.findUnique({ where: { id: actor.schoolId } });
    return this.prisma.timetableEntry.findMany({
      where: {
        schoolId: actor.schoolId,
        deletedAt: null,
        academicYearId: filters.academicYearId ?? school?.currentAcademicYearId ?? undefined,
        termId: filters.termId ?? school?.currentTermId ?? undefined,
        classId: filters.classId,
        streamId: filters.streamId,
        ...(teacherScope ? { OR: teacherScope } : { teacherId: filters.teacherId }),
        ...(scopedClassIds ? { AND: [{ classId: { in: scopedClassIds } }] } : {})
      },
      orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }]
    });
  }

  async create(actor: CurrentUser, body: unknown) {
    const input = timetableEntrySchema.parse(body);
    await this.validateOwnership(actor.schoolId, input);
    await assertClassWithinAcademicLevelScope(this.prisma, actor, input.classId);
    if (input.startsAt >= input.endsAt) throw new BadRequestException("Start time must be before end time.");
    const conflict = await this.prisma.timetableEntry.findFirst({
      where: {
        schoolId: actor.schoolId,
        termId: input.termId,
        dayOfWeek: input.dayOfWeek,
        deletedAt: null,
        AND: [
          {
            OR: [
              { teacherId: input.teacherId },
              { classId: input.classId, streamId: input.streamId ?? null },
              ...(input.room ? [{ room: input.room }] : [])
            ]
          },
          {
            OR: [
              { periodNumber: input.periodNumber },
              { startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } }
            ]
          }
        ]
      }
    });
    if (conflict) throw new ConflictException("Timetable conflict detected for teacher, class, or room.");
    const entry = await this.prisma.timetableEntry.create({ data: { schoolId: actor.schoolId, createdBy: actor.id, ...input, streamId: input.streamId ?? null, room: input.room ?? null } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "TIMETABLE_ENTRY_CREATED", entityType: "TIMETABLE_ENTRY", entityId: entry.id, newValue: entry });
    return entry;
  }

  private async teacherScope(actor: CurrentUser): Promise<Prisma.TimetableEntryWhereInput[] | null> {
    const permissions = new Set(actor.permissions);
    if (permissions.has(PermissionKey.TimetableManage) || permissions.has(PermissionKey.AcademicSetupManage)) return null;
    const teacher = await this.prisma.teacher.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id } });
    if (!teacher) return [{ id: "__no_timetable_for_user__" }];
    const school = await this.prisma.school.findUnique({ where: { id: actor.schoolId } });
    const classAssignments = await this.prisma.classTeacherAssignment.findMany({
      where: {
        schoolId: actor.schoolId,
        teacherId: teacher.id,
        isActive: true,
        ...(school?.currentAcademicYearId ? { academicYearId: school.currentAcademicYearId } : {}),
        ...(school?.currentTermId ? { OR: [{ termId: null }, { termId: school.currentTermId }] } : {})
      }
    });
    return [
      { teacherId: teacher.id },
      ...classAssignments.map((assignment) => ({
        classId: assignment.classId,
        ...(assignment.streamId ? { OR: [{ streamId: assignment.streamId }, { streamId: null }] } : {})
      }))
    ];
  }

  private async validateOwnership(schoolId: string, input: { academicYearId: string; termId: string; classId: string; streamId?: string | null; subjectId: string; teacherId: string }) {
    const [year, term, klass, subject, teacher] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: input.academicYearId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: input.termId, academicYear: { schoolId } } }),
      this.prisma.class.findFirst({ where: { id: input.classId, schoolId } }),
      this.prisma.subject.findFirst({ where: { id: input.subjectId, schoolId } }),
      this.prisma.teacher.findFirst({ where: { id: input.teacherId, schoolId } })
    ]);
    if (!year || !term || !klass || !subject || !teacher) throw new BadRequestException("Timetable academic year, term, class, subject, and teacher must belong to this school.");
    if (input.streamId) {
      const stream = await this.prisma.stream.findFirst({ where: { id: input.streamId, classId: input.classId, schoolId } });
      if (!stream) throw new BadRequestException("Timetable stream must belong to the selected class.");
    }
  }
}

function cleanTimetableQuery(query: Record<string, string | undefined>) {
  return {
    academicYearId: query.academicYearId || undefined,
    termId: query.termId || undefined,
    classId: query.classId || undefined,
    streamId: query.streamId || undefined,
    teacherId: query.teacherId || undefined
  };
}
