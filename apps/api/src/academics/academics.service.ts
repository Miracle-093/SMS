import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus, CurrentUser, PermissionKey, SyncStatus } from "@aethina/shared-types";
import { assessmentSchema, examinationSchema, marksEntrySchema, reportCardCommentSchema, resultDecisionSchema } from "@aethina/validation";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertClassWithinAcademicLevelScope, classIdsForAcademicLevelScope } from "../common/academic-scope.js";

@Injectable()
export class AcademicsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  examinations(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.examination.findMany({
      where: { schoolId, termId: query.termId, status: query.status },
      include: { term: true, assessments: { include: { subject: true, marks: true } } },
      orderBy: { startsAt: "desc" }
    });
  }

  async createExamination(actor: CurrentUser, body: unknown) {
    const input = examinationSchema.parse(body);
    await this.assertTerm(actor.schoolId, input.termId);
    const exam = await this.prisma.examination.create({
      data: {
        schoolId: actor.schoolId,
        termId: input.termId,
        academicYearId: input.academicYearId ?? null,
        name: input.name,
        examinationType: input.examinationType,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        status: input.status,
        description: input.description ?? null
      }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "EXAMINATION_CREATED", entityType: "EXAMINATION", entityId: exam.id, newValue: exam });
    return exam;
  }

  async assessments(actor: CurrentUser, query: Record<string, string | undefined>) {
    const visibility = await this.assessmentVisibility(actor);
    return this.prisma.assessment.findMany({
      where: { schoolId: actor.schoolId, examinationId: query.examinationId, termId: query.termId, classId: query.classId, subjectId: query.subjectId, status: query.status, AND: visibility },
      include: { subject: true, examination: true, marks: { include: { student: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async createAssessment(actor: CurrentUser, body: unknown) {
    const input = assessmentSchema.parse(body);
    await assertClassWithinAcademicLevelScope(this.prisma, actor, input.classId);
    const [exam, subject] = await Promise.all([
      this.prisma.examination.findFirst({ where: { id: input.examinationId, schoolId: actor.schoolId } }),
      this.prisma.subject.findFirst({ where: { id: input.subjectId, schoolId: actor.schoolId } })
    ]);
    if (!exam || !subject) throw new BadRequestException("Examination and subject must belong to this school.");
    const totals = await this.prisma.assessment.aggregate({
      where: { schoolId: actor.schoolId, examinationId: input.examinationId, classId: input.classId, streamId: input.streamId ?? null, subjectId: input.subjectId },
      _sum: { weight: true }
    });
    if (money(totals._sum.weight) + input.weight > 100) {
      throw new BadRequestException("Assessment weights for this class, subject, and exam cannot exceed 100.");
    }
    const assessment = await this.prisma.assessment.create({
      data: { schoolId: actor.schoolId, ...input, streamId: input.streamId ?? null, teacherId: input.teacherId ?? null, passMark: input.passMark ?? null }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "ASSESSMENT_CREATED", entityType: "ASSESSMENT", entityId: assessment.id, newValue: assessment });
    return assessment;
  }

  async marksEntry(actor: CurrentUser, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, schoolId: actor.schoolId },
      include: { subject: true, marks: true }
    });
    if (!assessment) throw new NotFoundException("Assessment not found.");
    await this.assertTeacherCanEnterMarks(actor, assessment);
    const students = await this.prisma.student.findMany({
      where: { schoolId: actor.schoolId, deletedAt: null, status: "ACTIVE", currentClassId: assessment.classId ?? undefined, currentStreamId: assessment.streamId ?? undefined },
      orderBy: [{ admissionNo: "asc" }]
    });
    const markByStudent = new Map(assessment.marks.map((mark) => [mark.studentId, mark]));
    return {
      assessment,
      students: students.map((student) => ({ ...student, mark: markByStudent.get(student.id) ?? null }))
    };
  }

  async saveMarks(actor: CurrentUser, body: unknown) {
    const input = marksEntrySchema.parse(body);
    const assessment = await this.prisma.assessment.findFirst({ where: { id: input.assessmentId, schoolId: actor.schoolId } });
    if (!assessment) throw new NotFoundException("Assessment not found.");
    await this.assertTeacherCanEnterMarks(actor, assessment);
    const maxScore = money(assessment.maxScore);
    const submittedStudentIds = input.entries.map((entry) => entry.studentId);
    if (new Set(submittedStudentIds).size !== submittedStudentIds.length) throw new BadRequestException("Marks entry contains duplicate students.");
    const eligibleStudents = await this.prisma.student.findMany({
      where: {
        id: { in: submittedStudentIds },
        schoolId: actor.schoolId,
        deletedAt: null,
        status: "ACTIVE",
        currentClassId: assessment.classId ?? undefined,
        currentStreamId: assessment.streamId ?? undefined
      },
      select: { id: true }
    });
    const eligibleStudentIds = new Set(eligibleStudents.map((student) => student.id));
    const missingStudentIds = submittedStudentIds.filter((studentId) => !eligibleStudentIds.has(studentId));
    if (missingStudentIds.length) throw new BadRequestException("Marks can only be entered for active students in the assessment class and stream.");
    const now = new Date();
    const status = input.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
    const marks = await this.prisma.$transaction(async (tx) => {
      const saved = [];
      for (const entry of input.entries) {
        if (entry.score > maxScore) throw new BadRequestException("Score cannot exceed assessment maximum.");
        const weightedScore = (entry.score / maxScore) * money(assessment.weight);
        const boundary = await this.gradeFor(actor.schoolId, entry.score);
        saved.push(await tx.mark.upsert({
          where: { studentId_assessmentId: { studentId: entry.studentId, assessmentId: assessment.id } },
          update: {
            score: entry.score,
            weightedScore,
            grade: boundary?.grade ?? null,
            teacherComment: entry.teacherComment ?? null,
            status,
            submittedBy: status === "SUBMITTED" ? actor.id : undefined,
            submittedAt: status === "SUBMITTED" ? now : undefined,
            version: { increment: 1 },
            syncStatus: SyncStatus.Synced,
            lastSyncedAt: now
          },
          create: {
            schoolId: actor.schoolId,
            studentId: entry.studentId,
            assessmentId: assessment.id,
            subjectId: assessment.subjectId,
            score: entry.score,
            weightedScore,
            grade: boundary?.grade ?? null,
            teacherComment: entry.teacherComment ?? null,
            status,
            submittedBy: status === "SUBMITTED" ? actor.id : null,
            submittedAt: status === "SUBMITTED" ? now : null,
            createdBy: actor.id,
            deviceId: input.deviceId ?? null,
            approvalStatus: status === "SUBMITTED" ? ApprovalStatus.Pending : ApprovalStatus.Draft,
            syncStatus: SyncStatus.Synced,
            lastSyncedAt: now
          }
        }));
      }
      await tx.assessment.update({
        where: { id: assessment.id },
        data: { status, submittedBy: status === "SUBMITTED" ? actor.id : assessment.submittedBy, submittedAt: status === "SUBMITTED" ? now : assessment.submittedAt }
      });
      if (status === "SUBMITTED") {
        await tx.approvalWorkflow.upsert({
          where: { entityId: assessment.id },
          update: { status: "SUBMITTED", requestedBy: actor.id },
          create: { schoolId: actor.schoolId, entityType: "ASSESSMENT_RESULTS", entityId: assessment.id, requestedBy: actor.id, status: "SUBMITTED" }
        });
      }
      return saved;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, deviceId: input.deviceId ?? null, action: status === "SUBMITTED" ? "MARKS_SUBMITTED" : "MARKS_SAVED", entityType: "ASSESSMENT", entityId: assessment.id, metadata: { count: marks.length } });
    return { assessmentId: assessment.id, status, marks };
  }

  async decideAssessment(actor: CurrentUser, id: string, body: unknown) {
    const input = resultDecisionSchema.parse(body);
    const assessment = await this.prisma.assessment.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!assessment) throw new NotFoundException("Assessment not found.");
    await assertClassWithinAcademicLevelScope(this.prisma, actor, assessment.classId);
    if (assessment.submittedBy === actor.id && ["APPROVED", "PUBLISHED"].includes(input.decision)) {
      throw new BadRequestException("A submitter cannot approve or publish their own marks.");
    }
    const status = input.decision === "RETURNED" ? "RETURNED_FOR_CORRECTION" : input.decision;
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.assessment.update({
        where: { id },
        data: { status, reviewedBy: actor.id, reviewedAt: now, reviewComment: input.comment ?? null, publishedAt: input.decision === "PUBLISHED" ? now : null }
      });
      await tx.mark.updateMany({
        where: { schoolId: actor.schoolId, assessmentId: id },
        data: { status, reviewedBy: actor.id, reviewedAt: now, reviewComment: input.comment ?? null, publishedAt: input.decision === "PUBLISHED" ? now : null, approvalStatus: input.decision === "REJECTED" || input.decision === "RETURNED" ? ApprovalStatus.Rejected : ApprovalStatus.Approved }
      });
      await tx.approvalWorkflow.updateMany({ where: { entityType: "ASSESSMENT_RESULTS", entityId: id }, data: { status, decision: status, decisionDate: now, comment: input.comment ?? null } });
      if (input.decision === "PUBLISHED") await this.generateReportCards(actor, { examinationId: assessment.examinationId ?? undefined, termId: assessment.termId });
      return updated;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: `ASSESSMENT_${status}`, entityType: "ASSESSMENT", entityId: id, metadata: { comment: input.comment } });
    return result;
  }

  async reportCards(actor: CurrentUser, query: Record<string, string | undefined>) {
    const visibility = await this.reportCardVisibility(actor);
    return this.prisma.reportCard.findMany({
      where: { schoolId: actor.schoolId, termId: query.termId, examinationId: query.examinationId, studentId: query.studentId, status: query.status, deletedAt: null, AND: visibility },
      include: { student: { include: { currentClass: true, currentStream: true } } },
      orderBy: [{ generatedAt: "desc" }],
      take: 200
    });
  }

  async generateReportCards(actor: CurrentUser, body: { termId?: string; examinationId?: string }) {
    const school = await this.prisma.school.findUnique({ where: { id: actor.schoolId } });
    const termId = body.termId ?? school?.currentTermId;
    if (!termId) throw new BadRequestException("A term is required.");
    const classTeacherScopes = await this.classTeacherScopes(actor);
    const scopedClassIds = await classIdsForAcademicLevelScope(this.prisma, actor);
    const studentScope: Prisma.StudentWhereInput[] = [];
    if (classTeacherScopes.length) studentScope.push({ OR: classTeacherScopes });
    if (scopedClassIds) studentScope.push(scopedClassIds.length ? { currentClassId: { in: scopedClassIds } } : { id: "__no_students_for_academic_scope__" });
    const marks = await this.prisma.mark.findMany({
      where: {
        schoolId: actor.schoolId,
        status: { in: ["APPROVED", "PUBLISHED", "SUBMITTED"] },
        assessment: { termId, examinationId: body.examinationId },
        ...(studentScope.length ? { student: { AND: studentScope } } : {})
      },
      include: { student: true, subject: true, assessment: true }
    });
    const byStudent = new Map<string, typeof marks>();
    for (const mark of marks) byStudent.set(mark.studentId, [...(byStudent.get(mark.studentId) ?? []), mark]);
    const cards = [];
    for (const [studentId, rows] of byStudent) {
      const total = rows.reduce((sum, row) => sum + money(row.weightedScore ?? row.score), 0);
      const average = rows.length ? total / rows.length : 0;
      const boundary = await this.gradeFor(actor.schoolId, average);
      const existingCard = await this.prisma.reportCard.findFirst({
        where: { studentId, termId, examinationId: body.examinationId ?? null }
      });
      if (existingCard?.status === "PUBLISHED") {
        cards.push(existingCard);
        continue;
      }
      const cardData = {
          totalScore: total,
          averageScore: average,
          grade: boundary?.grade ?? "N/A",
          remarks: boundary?.remark ?? null,
          subjectResults: rows.map((row) => ({ subject: row.subject.name, score: money(row.score), weightedScore: money(row.weightedScore), grade: row.grade, comment: row.teacherComment })) as Prisma.InputJsonValue,
          classId: rows[0].student.currentClassId,
          streamId: rows[0].student.currentStreamId,
          status: "PREPARED",
          preparedBy: actor.id,
          preparedAt: new Date(),
          approvalStatus: ApprovalStatus.Pending
      };
      cards.push(existingCard
        ? await this.prisma.reportCard.update({ where: { id: existingCard.id }, data: cardData })
        : await this.prisma.reportCard.create({
          data: {
          schoolId: actor.schoolId,
          createdBy: actor.id,
          studentId,
          termId,
          examinationId: body.examinationId ?? null,
          classId: rows[0].student.currentClassId,
          streamId: rows[0].student.currentStreamId,
          totalScore: total,
          averageScore: average,
          grade: boundary?.grade ?? "N/A",
          remarks: boundary?.remark ?? null,
          subjectResults: rows.map((row) => ({ subject: row.subject.name, score: money(row.score), weightedScore: money(row.weightedScore), grade: row.grade, comment: row.teacherComment })) as Prisma.InputJsonValue,
          status: "PREPARED",
          preparedBy: actor.id,
          preparedAt: new Date(),
          approvalStatus: ApprovalStatus.Pending
        }
      }));
    }
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "REPORT_CARDS_GENERATED", entityType: "TERM", entityId: termId, metadata: { count: cards.length } });
    return { createdOrUpdated: cards.length, cards };
  }

  async updateReportCard(actor: CurrentUser, id: string, body: unknown) {
    const input = reportCardCommentSchema.parse(body);
    await this.assertClassTeacherCanPrepareCard(actor, id);
    const card = await this.prisma.reportCard.update({
      where: { id },
      data: { ...input, nextTermOpeningDate: input.nextTermOpeningDate ? new Date(input.nextTermOpeningDate) : null, status: "PREPARED", preparedBy: actor.id, preparedAt: new Date(), approvalStatus: ApprovalStatus.Pending, version: { increment: 1 } }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "REPORT_CARD_COMMENTED", entityType: "REPORT_CARD", entityId: id });
    return card;
  }

  async publishReportCard(actor: CurrentUser, id: string) {
    const card = await this.prisma.reportCard.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!card) throw new NotFoundException("Report card not found.");
    await assertClassWithinAcademicLevelScope(this.prisma, actor, card.classId);
    if (!["PREPARED", "APPROVED"].includes(card.status)) {
      throw new BadRequestException("Class teacher must prepare the report card before DOS publishing.");
    }
    const now = new Date();
    const published = await this.prisma.reportCard.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: now, finalApprovedBy: actor.id, finalApprovedAt: now, approvalStatus: ApprovalStatus.Approved, version: { increment: 1 } } });
    await this.prisma.notification.create({ data: { schoolId: actor.schoolId, recipientType: "STUDENT", recipientId: card.studentId, category: "ACADEMICS", channel: "IN_APP", title: "Report card published", body: "A new report card is available in the portal.", createdBy: actor.id } });
    return published;
  }

  async studentHistory(actor: CurrentUser, studentId: string) {
    const scopedClassIds = await classIdsForAcademicLevelScope(this.prisma, actor);
    return this.prisma.student.findFirstOrThrow({
      where: { id: studentId, schoolId: actor.schoolId, ...(scopedClassIds ? { currentClassId: { in: scopedClassIds } } : {}) },
      include: {
        marks: { include: { subject: true, assessment: { include: { examination: true } } }, orderBy: { updatedAt: "desc" } },
        reportCards: { orderBy: { generatedAt: "desc" } },
        promotions: { orderBy: { promotionDate: "desc" } }
      }
    });
  }

  private assertTerm(schoolId: string, termId: string) {
    return this.prisma.term.findFirstOrThrow({ where: { id: termId, academicYear: { schoolId } } });
  }

  private gradeFor(schoolId: string, score: number) {
    return this.prisma.gradeBoundary.findFirst({ where: { schoolId, minScore: { lte: score }, maxScore: { gte: score } }, orderBy: { minScore: "desc" } });
  }

  private async assessmentVisibility(actor: CurrentUser): Promise<Prisma.AssessmentWhereInput[]> {
    const permissions = new Set(actor.permissions);
    const scopedClassIds = await classIdsForAcademicLevelScope(this.prisma, actor);
    if (scopedClassIds) return scopedClassIds.length ? [{ classId: { in: scopedClassIds } }] : [{ id: "__no_assessments_for_academic_scope__" }];
    if (permissions.has(PermissionKey.AcademicsManage) || permissions.has(PermissionKey.MarksReview) || permissions.has(PermissionKey.ReportCardsPublish)) return [];
    const teacher = await this.prisma.teacher.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id } });
    if (!teacher) return [{ id: "__no_assessments_for_user__" }];
    const assignments = await this.prisma.teacherSubjectAssignment.findMany({ where: { schoolId: actor.schoolId, teacherId: teacher.id, isActive: true } });
    const ownership = assignments.map((assignment) => ({
      subjectId: assignment.subjectId,
      classId: assignment.classId,
      ...(assignment.streamId ? { streamId: assignment.streamId } : {})
    }));
    return ownership.length ? [{ OR: ownership }] : [{ id: "__no_assessments_for_user__" }];
  }

  private async assertTeacherCanEnterMarks(actor: CurrentUser, assessment: { subjectId: string; classId: string | null; streamId: string | null; teacherId: string | null }) {
    const teacher = await this.prisma.teacher.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id } });
    if (!teacher) throw new BadRequestException("Only assigned teachers can enter marks.");
    const assignment = await this.prisma.teacherSubjectAssignment.findFirst({
      where: {
        schoolId: actor.schoolId,
        teacherId: teacher.id,
        subjectId: assessment.subjectId,
        classId: assessment.classId ?? undefined,
        streamId: assessment.streamId ?? null,
        isActive: true
      }
    });
    if (!assignment && assessment.teacherId !== teacher.id) {
      throw new BadRequestException("This assessment is outside the teacher's subject allocation.");
    }
  }

  private async assertClassTeacherCanPrepareCard(actor: CurrentUser, reportCardId: string) {
    if (actor.permissions.includes(PermissionKey.ReportCardsPublish)) return;
    const card = await this.prisma.reportCard.findFirst({ where: { id: reportCardId, schoolId: actor.schoolId } });
    if (!card) throw new NotFoundException("Report card not found.");
    const teacher = await this.prisma.teacher.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id } });
    if (!teacher || !card.classId) throw new BadRequestException("Only the assigned class teacher can prepare this report card.");
    const assignment = await this.prisma.classTeacherAssignment.findFirst({
      where: {
        schoolId: actor.schoolId,
        teacherId: teacher.id,
        classId: card.classId,
        streamId: card.streamId ?? null,
        isActive: true
      }
    });
    if (!assignment) throw new BadRequestException("Only the assigned class teacher can prepare this report card.");
  }

  private async reportCardVisibility(actor: CurrentUser): Promise<Prisma.ReportCardWhereInput[]> {
    const permissions = new Set(actor.permissions);
    const scopedClassIds = await classIdsForAcademicLevelScope(this.prisma, actor);
    if (scopedClassIds) return scopedClassIds.length ? [{ classId: { in: scopedClassIds } }] : [{ id: "__no_report_cards_for_academic_scope__" }];
    if (permissions.has(PermissionKey.ReportCardsPublish) || permissions.has(PermissionKey.AcademicsManage) || permissions.has(PermissionKey.MarksReview)) return [];
    const scopes = await this.classTeacherScopes(actor);
    return scopes.length ? [{ OR: scopes.map((scope) => ({ classId: scope.currentClassId, streamId: scope.currentStreamId })) }] : [{ id: "__no_report_cards_for_user__" }];
  }

  private async classTeacherScopes(actor: CurrentUser): Promise<Array<{ currentClassId: string; currentStreamId?: string }>> {
    if (actor.permissions.includes(PermissionKey.ReportCardsPublish)) return [];
    const teacher = await this.prisma.teacher.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id } });
    if (!teacher) return [];
    const assignments = await this.prisma.classTeacherAssignment.findMany({ where: { schoolId: actor.schoolId, teacherId: teacher.id, isActive: true } });
    return assignments.map((assignment) => ({
      currentClassId: assignment.classId,
      ...(assignment.streamId ? { currentStreamId: assignment.streamId } : {})
    }));
  }
}

function money(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "object" && "toNumber" in value ? value.toNumber() : Number(value);
}
