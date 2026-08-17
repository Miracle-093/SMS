import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { TimetableController } from "./timetable.controller.js";
import { TimetableService } from "./timetable.service.js";

@Module({ imports: [PrismaModule, AuditModule, AuthModule], controllers: [TimetableController], providers: [TimetableService] })
export class TimetableModule {}
