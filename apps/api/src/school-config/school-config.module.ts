import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { SchoolConfigController } from "./school-config.controller.js";
import { SchoolConfigService } from "./school-config.service.js";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [SchoolConfigController],
  providers: [SchoolConfigService]
})
export class SchoolConfigModule {}
