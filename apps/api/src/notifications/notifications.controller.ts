import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { PermissionKey, type CurrentUser } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { NotificationsService } from "./notifications.service.js";

@Controller()
@UseGuards(AuthGuard, PermissionGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get("notifications")
  @RequirePermissions(PermissionKey.NotificationsManage)
  list(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) { return this.notifications.list(user.schoolId, query); }

  @Post("notifications/queue")
  @RequirePermissions(PermissionKey.NotificationsManage)
  queue(@CurrentUserParam() user: CurrentUser, @Body() body: { recipientType: string; recipientId?: string; channel?: string; category?: string; title: string; body: string; templateId?: string; payload?: unknown }) { return this.notifications.queue(user, body); }

  @Post("notifications/:id/process")
  @RequirePermissions(PermissionKey.NotificationsManage)
  process(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) { return this.notifications.process(user, id); }

  @Get("notifications/templates")
  @RequirePermissions(PermissionKey.NotificationsManage)
  templates(@CurrentUserParam() user: CurrentUser) { return this.notifications.templates(user.schoolId); }

  @Post("notifications/templates")
  @RequirePermissions(PermissionKey.NotificationsManage)
  createTemplate(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) { return this.notifications.createTemplate(user, body); }

  @Get("announcements")
  @RequirePermissions(PermissionKey.AnnouncementsManage)
  announcements(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) { return this.notifications.announcements(user.schoolId, query); }

  @Post("announcements")
  @RequirePermissions(PermissionKey.AnnouncementsManage)
  createAnnouncement(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) { return this.notifications.createAnnouncement(user, body); }
}
