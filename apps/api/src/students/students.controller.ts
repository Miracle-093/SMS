import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, PermissionKey } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { StudentsService } from "./students.service.js";

@Controller("students")
@UseGuards(AuthGuard, PermissionGuard)
export class StudentsController {
  constructor(@Inject(StudentsService) private readonly students: StudentsService) {}

  @Get()
  @RequirePermissions(PermissionKey.StudentsRead)
  list(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.students.list(user, query);
  }

  @Get(":id")
  @RequirePermissions(PermissionKey.StudentsRead)
  profile(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.students.profile(user, id);
  }

  @Post()
  @RequirePermissions(PermissionKey.AdmissionsManage)
  register(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.students.register(user, body);
  }

  @Put(":id")
  @RequirePermissions(PermissionKey.AdmissionsManage)
  update(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: unknown) {
    return this.students.update(user, id, body);
  }

  @Post(":id/activate")
  @RequirePermissions(PermissionKey.AdmissionsManage)
  activate(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.students.setActive(user, id, true);
  }

  @Post(":id/deactivate")
  @RequirePermissions(PermissionKey.AdmissionsManage)
  deactivate(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.students.setActive(user, id, false);
  }

  @Post(":id/reset-portal-credentials")
  @RequirePermissions(PermissionKey.AdmissionsManage)
  resetPortal(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.students.resetPortalCredentials(user, id);
  }

  @Post("promotions")
  @RequirePermissions(PermissionKey.AdmissionsManage)
  promote(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.students.promote(user, body);
  }
}
