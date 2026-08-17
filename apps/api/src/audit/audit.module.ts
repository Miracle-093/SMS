import { Module } from "@nestjs/common";
import { TokenService } from "../auth/token.service.js";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";

@Module({
  controllers: [AuditController],
  providers: [AuditService, TokenService],
  exports: [AuditService]
})
export class AuditModule {}
