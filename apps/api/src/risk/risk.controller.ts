import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, PermissionKey } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { RiskService } from "./risk.service.js";

@Controller("risk-alerts")
@UseGuards(AuthGuard, PermissionGuard)
export class RiskController {
  constructor(@Inject(RiskService) private readonly risk: RiskService) {}

  @Get()
  @RequirePermissions(PermissionKey.RiskReview)
  list(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.risk.list(user.schoolId, query);
  }

  @Post(":id/review")
  @RequirePermissions(PermissionKey.RiskReview)
  review(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: unknown) {
    return this.risk.review(user, id, body);
  }
}
