import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionKey, type CurrentUser } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { PayrollService } from "./payroll.service.js";

@Controller("payroll")
@UseGuards(AuthGuard, PermissionGuard)
export class PayrollController {
  constructor(@Inject(PayrollService) private readonly payroll: PayrollService) {}

  @Get("profiles")
  @RequirePermissions(PermissionKey.PayrollRead)
  profiles(@CurrentUserParam() user: CurrentUser) { return this.payroll.profiles(user.schoolId); }

  @Post("profiles")
  @RequirePermissions(PermissionKey.PayrollManage)
  createProfile(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) { return this.payroll.createProfile(user, body); }

  @Post("components")
  @RequirePermissions(PermissionKey.PayrollManage)
  createComponent(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) { return this.payroll.createComponent(user, body); }

  @Get("runs")
  @RequirePermissions(PermissionKey.PayrollRead)
  runs(@CurrentUserParam() user: CurrentUser) { return this.payroll.runs(user.schoolId); }

  @Post("runs")
  @RequirePermissions(PermissionKey.PayrollManage)
  createRun(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) { return this.payroll.createRun(user, body); }

  @Post("runs/:id/calculate")
  @RequirePermissions(PermissionKey.PayrollManage)
  calculate(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) { return this.payroll.calculate(user, id); }

  @Post("runs/:id/submit")
  @RequirePermissions(PermissionKey.PayrollManage)
  submit(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) { return this.payroll.submit(user, id); }

  @Post("runs/:id/approve")
  @RequirePermissions(PermissionKey.ApprovalReview)
  approve(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: { approved: boolean }) { return this.payroll.approve(user, id, body.approved); }

  @Post("runs/:id/process")
  @RequirePermissions(PermissionKey.PayrollManage)
  process(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) { return this.payroll.process(user, id); }

  @Get("records")
  @RequirePermissions(PermissionKey.PayrollRead)
  records(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) { return this.payroll.records(user.schoolId, query); }

  @Get("payslips/:id")
  @RequirePermissions(PermissionKey.PayrollRead)
  payslip(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) { return this.payroll.payslip(user.schoolId, id); }
}
