import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, PermissionKey } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { AuditService } from "./audit.service.js";

@Controller("audit")
@UseGuards(AuthGuard, PermissionGuard)
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PermissionKey.AuditRead)
  list(@CurrentUserParam() user: CurrentUser, @Query() query: { action?: string; entityType?: string; take?: string }) {
    return this.audit.list(user.schoolId, query);
  }
}
