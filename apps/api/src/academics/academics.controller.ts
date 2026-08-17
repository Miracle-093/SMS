import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { PermissionKey, type CurrentUser } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { AcademicsService } from "./academics.service.js";

@Controller("academics")
@UseGuards(AuthGuard, PermissionGuard)
export class AcademicsController {
  constructor(@Inject(AcademicsService) private readonly academics: AcademicsService) {}

  @Get("examinations")
  @RequirePermissions(PermissionKey.AcademicsRead)
  examinations(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.academics.examinations(user.schoolId, query);
  }

  @Post("examinations")
  @RequirePermissions(PermissionKey.AcademicsManage)
  createExamination(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.academics.createExamination(user, body);
  }

  @Get("assessments")
  @RequirePermissions(PermissionKey.AcademicsRead)
  assessments(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.academics.assessments(user.schoolId, query);
  }

  @Post("assessments")
  @RequirePermissions(PermissionKey.AcademicsManage)
  createAssessment(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.academics.createAssessment(user, body);
  }

  @Get("marks-entry/:assessmentId")
  @RequirePermissions(PermissionKey.MarksEntry)
  marksEntry(@CurrentUserParam() user: CurrentUser, @Param("assessmentId") assessmentId: string) {
    return this.academics.marksEntry(user.schoolId, assessmentId);
  }

  @Post("marks")
  @RequirePermissions(PermissionKey.MarksEntry)
  saveMarks(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.academics.saveMarks(user, body);
  }

  @Post("assessments/:id/decision")
  @RequirePermissions(PermissionKey.ResultsApprove)
  decideAssessment(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: unknown) {
    return this.academics.decideAssessment(user, id, body);
  }

  @Get("report-cards")
  @RequirePermissions(PermissionKey.AcademicsRead)
  reportCards(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.academics.reportCards(user.schoolId, query);
  }

  @Post("report-cards/generate")
  @RequirePermissions(PermissionKey.ResultsApprove)
  generateReportCards(@CurrentUserParam() user: CurrentUser, @Body() body: { termId?: string; examinationId?: string }) {
    return this.academics.generateReportCards(user, body);
  }

  @Put("report-cards/:id")
  @RequirePermissions(PermissionKey.ResultsApprove)
  updateReportCard(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: unknown) {
    return this.academics.updateReportCard(user, id, body);
  }

  @Post("report-cards/:id/publish")
  @RequirePermissions(PermissionKey.ResultsApprove)
  publishReportCard(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.academics.publishReportCard(user, id);
  }

  @Get("students/:id/history")
  @RequirePermissions(PermissionKey.AcademicsRead)
  studentHistory(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.academics.studentHistory(user.schoolId, id);
  }
}
