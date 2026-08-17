import { Body, Controller, Get, Inject, Post, Put, UseGuards } from "@nestjs/common";
import { CurrentUser, PermissionKey } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { SchoolConfigService } from "./school-config.service.js";

@Controller("school-config")
@UseGuards(AuthGuard, PermissionGuard)
export class SchoolConfigController {
  constructor(@Inject(SchoolConfigService) private readonly schoolConfig: SchoolConfigService) {}

  @Get()
  @RequirePermissions(PermissionKey.StudentsRead)
  overview(@CurrentUserParam() user: CurrentUser) {
    return this.schoolConfig.overview(user.schoolId);
  }

  @Put("profile")
  @RequirePermissions(PermissionKey.SchoolConfigManage)
  updateProfile(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.schoolConfig.updateProfile(user, body);
  }

  @Post("academic-years")
  @RequirePermissions(PermissionKey.SchoolConfigManage)
  createAcademicYear(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.schoolConfig.createAcademicYear(user, body);
  }

  @Post("terms")
  @RequirePermissions(PermissionKey.SchoolConfigManage)
  createTerm(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.schoolConfig.createTerm(user, body);
  }

  @Post("classes")
  @RequirePermissions(PermissionKey.SchoolConfigManage)
  createClass(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.schoolConfig.createClass(user, body);
  }

  @Post("streams")
  @RequirePermissions(PermissionKey.SchoolConfigManage)
  createStream(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.schoolConfig.createStream(user, body);
  }

  @Post("subjects")
  @RequirePermissions(PermissionKey.SchoolConfigManage)
  createSubject(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.schoolConfig.createSubject(user, body);
  }

  @Post("grade-boundaries")
  @RequirePermissions(PermissionKey.SchoolConfigManage)
  createGradeBoundary(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.schoolConfig.createGradeBoundary(user, body);
  }
}
