import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PasswordService } from "../auth/password.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PortalController } from "./portal.controller.js";
import { PortalService } from "./portal.service.js";

@Module({ imports: [PrismaModule, AuditModule, AuthModule], controllers: [PortalController], providers: [PortalService, PasswordService] })
export class PortalModule {}
