import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
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
  push(@Body() body: unknown) {
    return this.syncService.push(syncPushSchema.parse(body));
  }

  @Post("pull")
  pull(@Body() body: unknown) {
    return this.syncService.pull(syncPullSchema.parse(body));
  }

  @Post("retry")
  retry(@Body() body: { deviceId: string; schoolId: string }) {
    return this.syncService.retryFailed(body.schoolId, body.deviceId);
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
}
