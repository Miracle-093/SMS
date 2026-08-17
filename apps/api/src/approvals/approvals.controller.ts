import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, PermissionKey } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { ApprovalsService } from "./approvals.service.js";

@Controller("approvals")
@UseGuards(AuthGuard, PermissionGuard)
export class ApprovalsController {
  constructor(@Inject(ApprovalsService) private readonly approvals: ApprovalsService) {}

  @Get()
  @RequirePermissions(PermissionKey.ApprovalReview)
  inbox(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.approvals.inbox(user.schoolId, query);
  }

  @Post(":id/decision")
  @RequirePermissions(PermissionKey.ApprovalReview)
  decide(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: unknown) {
    return this.approvals.decide(user, id, body);
  }
}
