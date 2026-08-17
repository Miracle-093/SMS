import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceService } from "./attendance.service.js";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [AttendanceController],
  providers: [AttendanceService]
})
export class AttendanceModule {}
