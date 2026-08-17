import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { ApprovalsController } from "./approvals.controller.js";
import { ApprovalsService } from "./approvals.service.js";

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService]
})
export class ApprovalsModule {}
