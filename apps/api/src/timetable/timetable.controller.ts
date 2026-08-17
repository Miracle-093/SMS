import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionKey, type CurrentUser } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { TimetableService } from "./timetable.service.js";

@Controller("timetable")
@UseGuards(AuthGuard, PermissionGuard)
export class TimetableController {
  constructor(@Inject(TimetableService) private readonly timetable: TimetableService) {}

  @Get()
  @RequirePermissions(PermissionKey.AcademicsRead)
  list(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.timetable.list(user.schoolId, query);
  }

  @Post()
  @RequirePermissions(PermissionKey.TimetableManage)
  create(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.timetable.create(user, body);
  }
}
