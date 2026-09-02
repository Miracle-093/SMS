import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
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
    return this.prisma.timetableEntry.findMany({
      where: { schoolId: actor.schoolId, deletedAt: null, academicYearId: query.academicYearId, termId: query.termId, classId: query.classId, streamId: query.streamId, teacherId: teacherScope ?? query.teacherId, ...(scopedClassIds ? { AND: [{ classId: { in: scopedClassIds } }] } : {}) },
      orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }]
    });
  }

  async create(actor: CurrentUser, body: unknown) {
    const input = timetableEntrySchema.parse(body);
    await assertClassWithinAcademicLevelScope(this.prisma, actor, input.classId);
    if (input.startsAt >= input.endsAt) throw new BadRequestException("Start time must be before end time.");
    const conflict = await this.prisma.timetableEntry.findFirst({
      where: {
        schoolId: actor.schoolId,
        termId: input.termId,
        dayOfWeek: input.dayOfWeek,
        periodNumber: input.periodNumber,
        deletedAt: null,
        OR: [
          { teacherId: input.teacherId },
          { classId: input.classId, streamId: input.streamId ?? null },
          ...(input.room ? [{ room: input.room }] : [])
        ]
      }
    });
    if (conflict) throw new ConflictException("Timetable conflict detected for teacher, class, or room.");
    const entry = await this.prisma.timetableEntry.create({ data: { schoolId: actor.schoolId, createdBy: actor.id, ...input, streamId: input.streamId ?? null, room: input.room ?? null } });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "TIMETABLE_ENTRY_CREATED", entityType: "TIMETABLE_ENTRY", entityId: entry.id, newValue: entry });
    return entry;
  }

  private async teacherScope(actor: CurrentUser) {
    const permissions = new Set(actor.permissions);
    if (permissions.has(PermissionKey.TimetableManage) || permissions.has(PermissionKey.AcademicSetupManage)) return null;
    const teacher = await this.prisma.teacher.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id } });
    return teacher?.id ?? "__no_timetable_for_user__";
  }
}
