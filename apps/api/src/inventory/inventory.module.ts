import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { InventoryController } from "./inventory.controller.js";
import { InventoryService } from "./inventory.service.js";

@Module({ imports: [PrismaModule, AuditModule, AuthModule], controllers: [InventoryController], providers: [InventoryService] })
export class InventoryModule {}
