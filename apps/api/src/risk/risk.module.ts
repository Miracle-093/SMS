import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RiskController } from "./risk.controller.js";
import { RiskService } from "./risk.service.js";

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  controllers: [RiskController],
  providers: [RiskService]
})
export class RiskModule {}
