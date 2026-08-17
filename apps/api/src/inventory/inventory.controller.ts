import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionKey, type CurrentUser } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { InventoryService } from "./inventory.service.js";

@Controller("inventory")
@UseGuards(AuthGuard, PermissionGuard)
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get("items")
  @RequirePermissions(PermissionKey.InventoryManage)
  items(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.inventory.items(user.schoolId, query);
  }

  @Post("items")
  @RequirePermissions(PermissionKey.InventoryManage)
  createItem(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.inventory.createItem(user, body);
  }

  @Get("suppliers")
  @RequirePermissions(PermissionKey.InventoryManage)
  suppliers(@CurrentUserParam() user: CurrentUser) {
    return this.inventory.suppliers(user.schoolId);
  }

  @Post("suppliers")
  @RequirePermissions(PermissionKey.InventoryManage)
  createSupplier(@CurrentUserParam() user: CurrentUser, @Body() body: { name: string; phone?: string; email?: string; address?: string }) {
    return this.inventory.createSupplier(user, body);
  }

  @Get("movements")
  @RequirePermissions(PermissionKey.InventoryManage)
  movements(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.inventory.movements(user.schoolId, query);
  }

  @Post("movements")
  @RequirePermissions(PermissionKey.InventoryManage)
  createMovement(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.inventory.createMovement(user, body);
  }

  @Post("movements/:id/approve")
  @RequirePermissions(PermissionKey.ApprovalReview)
  approve(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: { approved: boolean }) {
    return this.inventory.approveMovement(user, id, body.approved);
  }

  @Get("reports/:type")
  @RequirePermissions(PermissionKey.InventoryManage)
  report(@CurrentUserParam() user: CurrentUser, @Param("type") type: string) {
    return this.inventory.report(user.schoolId, type);
  }
}
