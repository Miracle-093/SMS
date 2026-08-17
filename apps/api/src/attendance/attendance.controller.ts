import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, PermissionKey } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { AttendanceService } from "./attendance.service.js";

@Controller("teacher-attendance")
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendanceService: AttendanceService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions(PermissionKey.AttendanceManage)
  list(@CurrentUserParam() user: CurrentUser, @Query("date") date?: string) {
    return this.attendanceService.list(user.schoolId, date);
  }

  @Get("correction-requests")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions(PermissionKey.AttendanceManage)
  correctionRequests(@CurrentUserParam() user: CurrentUser) {
    return this.attendanceService.correctionRequests(user.schoolId);
  }

  @Post("check-in")
  checkIn(@Body() body: { staffId: string; pin: string; deviceId: string; occurredAt: string }) {
    return this.attendanceService.checkIn(body);
  }

  @Post("check-out")
  checkOut(@Body() body: { staffId: string; pin: string; deviceId: string; occurredAt: string }) {
    return this.attendanceService.checkOut(body);
  }

  @Post(":id/correction-request")
  requestCorrection(@Param("id") id: string, @Body() body: { requestedBy: string; reason: string; requestedCheckInAt?: string; requestedCheckOutAt?: string }) {
    return this.attendanceService.requestCorrection(id, body);
  }

  @Post(":id/approve-correction")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions(PermissionKey.AttendanceManage)
  approveCorrection(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.attendanceService.approveCorrection(user, id);
  }

  @Post(":id/reject-correction")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions(PermissionKey.AttendanceManage)
  rejectCorrection(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: { reason?: string }) {
    return this.attendanceService.rejectCorrection(user, id, body.reason);
  }
}
