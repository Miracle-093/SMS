import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AttendanceModule } from "./attendance/attendance.module.js";
import { AcademicsModule } from "./academics/academics.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { ApprovalsModule } from "./approvals/approvals.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { FinanceModule } from "./finance/finance.module.js";
import { HealthModule } from "./health/health.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { PayrollModule } from "./payroll/payroll.module.js";
import { PortalModule } from "./portal/portal.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RiskModule } from "./risk/risk.module.js";
import { SchoolConfigModule } from "./school-config/school-config.module.js";
import { StudentsModule } from "./students/students.module.js";
import { SyncModule } from "./sync/sync.module.js";
import { TimetableModule } from "./timetable/timetable.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    PrismaModule,
    HealthModule,
    AuditModule,
    AuthModule,
    UsersModule,
    SchoolConfigModule,
    StudentsModule,
    AttendanceModule,
    AcademicsModule,
    TimetableModule,
    FinanceModule,
    InventoryModule,
    PayrollModule,
    NotificationsModule,
    PortalModule,
    DashboardModule,
    ApprovalsModule,
    RiskModule,
    SyncModule
  ]
})
export class AppModule {}
