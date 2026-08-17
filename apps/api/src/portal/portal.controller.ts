import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import type { CurrentUser } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PortalService } from "./portal.service.js";

@Controller("portal")
@UseGuards(AuthGuard)
export class PortalController {
  constructor(@Inject(PortalService) private readonly portal: PortalService) {}

  @Get("home")
  home(@CurrentUserParam() user: CurrentUser) { return this.portal.home(user); }

  @Get("finance")
  finance(@CurrentUserParam() user: CurrentUser) { return this.portal.finance(user); }

  @Get("academics")
  academics(@CurrentUserParam() user: CurrentUser) { return this.portal.academics(user); }

  @Get("timetable")
  timetable(@CurrentUserParam() user: CurrentUser) { return this.portal.timetable(user); }

  @Get("announcements")
  announcements(@CurrentUserParam() user: CurrentUser) { return this.portal.announcements(user); }

  @Get("notifications")
  notifications(@CurrentUserParam() user: CurrentUser) { return this.portal.notifications(user); }

  @Post("notifications/:id/read")
  markRead(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) { return this.portal.markNotificationRead(user, id); }

  @Post("change-password")
  changePassword(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) { return this.portal.changePassword(user, body); }
}
