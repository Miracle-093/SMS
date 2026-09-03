import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { CurrentUser, PermissionKey } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
@UseGuards(AuthGuard, PermissionGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get("summary")
  @RequirePermissions(PermissionKey.DashboardRead)
  summary(@CurrentUserParam() user: CurrentUser) {
    return this.dashboard.summary(user);
  }

  @Get("alerts")
  @RequirePermissions(PermissionKey.DashboardRead)
  alerts(@CurrentUserParam() user: CurrentUser) {
    return this.dashboard.alerts(user);
  }

  @Get("activity")
  @RequirePermissions(PermissionKey.DashboardRead)
  recentActivity(@CurrentUserParam() user: CurrentUser) {
    return this.dashboard.recentActivity(user.schoolId);
  }

  @Get("teacher-workspace")
  @RequirePermissions(PermissionKey.DashboardRead)
  teacherWorkspace(@CurrentUserParam() user: CurrentUser) {
    return this.dashboard.teacherWorkspace(user);
  }
}
