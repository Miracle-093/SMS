import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PayrollController } from "./payroll.controller.js";
import { PayrollService } from "./payroll.service.js";

@Module({ imports: [PrismaModule, AuditModule, AuthModule], controllers: [PayrollController], providers: [PayrollService] })
export class PayrollModule {}
