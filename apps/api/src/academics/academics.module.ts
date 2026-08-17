import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AcademicsController } from "./academics.controller.js";
import { AcademicsService } from "./academics.service.js";

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  controllers: [AcademicsController],
  providers: [AcademicsService],
  exports: [AcademicsService]
})
export class AcademicsModule {}
