import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { PermissionKey, CurrentUser } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { UsersService } from "./users.service.js";

@Controller("users")
@UseGuards(AuthGuard, PermissionGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(PermissionKey.UsersManage)
  list(@CurrentUserParam() user: CurrentUser) {
    return this.usersService.list(user.schoolId);
  }

  @Get("roles")
  @RequirePermissions(PermissionKey.UsersManage)
  roles(@CurrentUserParam() user: CurrentUser) {
    return this.usersService.roles(user.schoolId);
  }

  @Get("academic-scopes")
  @RequirePermissions(PermissionKey.UsersManage)
  academicScopes(@CurrentUserParam() user: CurrentUser) {
    return this.usersService.academicScopes(user.schoolId);
  }

  @Post()
  @RequirePermissions(PermissionKey.UsersManage)
  create(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.usersService.create(user, body);
  }

  @Post(":id/activate")
  @RequirePermissions(PermissionKey.UsersManage)
  activate(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.usersService.setActive(user, id, true);
  }

  @Post(":id/deactivate")
  @RequirePermissions(PermissionKey.UsersManage)
  deactivate(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.usersService.setActive(user, id, false);
  }

  @Post("reset-password")
  @RequirePermissions(PermissionKey.UsersManage)
  resetPassword(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.usersService.resetPassword(user, body);
  }

  @Post(":id/roles")
  @RequirePermissions(PermissionKey.UsersManage)
  assignRoles(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: unknown) {
    return this.usersService.assignRoles(user, id, body);
  }

  @Post(":id/academic-scopes")
  @RequirePermissions(PermissionKey.UsersManage)
  assignAcademicScopes(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: unknown) {
    return this.usersService.assignAcademicScopes(user, id, body);
  }

  @Post("academic-scopes/:id/deactivate")
  @RequirePermissions(PermissionKey.UsersManage)
  deactivateAcademicScope(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.usersService.deactivateAcademicScope(user, id);
  }
}
