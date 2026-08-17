import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { type CurrentUser } from "@aethina/shared-types";
import { timetableEntrySchema } from "@aethina/validation";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class TimetableService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  list(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.timetableEntry.findMany({
      where: { schoolId, deletedAt: null, academicYearId: query.academicYearId, termId: query.termId, classId: query.classId, streamId: query.streamId, teacherId: query.teacherId },
      orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }]
    });
  }

  async create(actor: CurrentUser, body: unknown) {
    const input = timetableEntrySchema.parse(body);
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
}
