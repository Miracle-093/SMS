import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { FinanceModule } from "../finance/finance.module.js";
import { StudentsModule } from "../students/students.module.js";
import { SyncController } from "./sync.controller.js";
import { SyncService } from "./sync.service.js";

@Module({
  imports: [AuditModule, AuthModule, FinanceModule, StudentsModule],
  controllers: [SyncController],
  providers: [SyncService]
})
export class SyncModule {}
