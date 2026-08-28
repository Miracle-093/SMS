import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, PermissionKey } from "@aethina/shared-types";
import { syncPullSchema, syncPushSchema } from "@aethina/validation";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { SyncService } from "./sync.service.js";

@Controller("sync")
export class SyncController {
  constructor(@Inject(SyncService) private readonly syncService: SyncService) {}

  @Post("push")
  @UseGuards(AuthGuard)
  push(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    this.assertStaffSyncUser(user);
    const input = syncPushSchema.parse(body);
    return this.syncService.push(user, { ...input, schoolId: user.schoolId });
  }

  @Post("pull")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  pull(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    this.assertStaffSyncUser(user);
    const input = syncPullSchema.parse(body);
    return this.syncService.pull(user, { ...input, schoolId: user.schoolId });
  }

  @Post("retry")
  @UseGuards(AuthGuard)
  retry(@CurrentUserParam() user: CurrentUser, @Body() body: { deviceId: string; schoolId?: string }) {
    this.assertStaffSyncUser(user);
    return this.syncService.retryFailed(user, body.deviceId);
  }

  @Get("conflicts")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions(PermissionKey.SyncReview)
  conflicts(@CurrentUserParam() user: CurrentUser) {
    return this.syncService.conflicts(user.schoolId);
  }

  @Post("conflicts/:id/resolve")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions(PermissionKey.SyncReview)
  resolveConflict(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.syncService.resolveConflict(user, id);
  }

  @Post("conflicts/:id/reject")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions(PermissionKey.SyncReview)
  rejectConflict(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.syncService.rejectConflict(user, id);
  }

  private assertStaffSyncUser(user: CurrentUser) {
    if (user.roles.includes("PORTAL_USER")) {
      throw new ForbiddenException("Portal users cannot synchronize staff data.");
    }
  }
}
