import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, PermissionKey } from "@aethina/shared-types";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUserParam } from "../common/current-user.decorator.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { RequirePermissions } from "../common/permissions.decorator.js";
import { FinanceService } from "./finance.service.js";

@Controller("finance")
@UseGuards(AuthGuard, PermissionGuard)
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly finance: FinanceService) {}

  @Get("overview")
  @RequirePermissions(PermissionKey.FinanceRead)
  overview(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.finance.overview(user.schoolId, query);
  }

  @Get("fee-structures")
  @RequirePermissions(PermissionKey.FinanceRead)
  feeStructures(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.finance.feeStructures(user.schoolId, query);
  }

  @Post("fee-structures")
  @RequirePermissions(PermissionKey.FinanceManage)
  createFeeStructure(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.finance.createFeeStructure(user, body);
  }

  @Get("invoices")
  @RequirePermissions(PermissionKey.FinanceRead)
  invoices(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.finance.invoices(user.schoolId, query);
  }

  @Post("invoices/generate")
  @RequirePermissions(PermissionKey.FinanceManage)
  generateInvoices(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.finance.generateInvoices(user, body);
  }

  @Post("invoices/manual")
  @RequirePermissions(PermissionKey.FinanceManage)
  manualInvoice(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.finance.createManualInvoice(user, body);
  }

  @Post("payments")
  @RequirePermissions(PermissionKey.FinanceManage)
  recordPayment(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.finance.recordPayment(user, body);
  }

  @Get("receipts/:id")
  @RequirePermissions(PermissionKey.FinanceRead)
  receipt(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.finance.receipt(user.schoolId, id);
  }

  @Post("receipts/:id/reprint")
  @RequirePermissions(PermissionKey.FinanceManage)
  reprintReceipt(@CurrentUserParam() user: CurrentUser, @Param("id") id: string) {
    return this.finance.reprintReceipt(user, id);
  }

  @Post("reversals")
  @RequirePermissions(PermissionKey.FinanceManage)
  requestReversal(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.finance.requestReversal(user, body);
  }

  @Post("reversals/:id/approve")
  @RequirePermissions(PermissionKey.ApprovalReview)
  approveReversal(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: { comment?: string | null }) {
    return this.finance.decideReversal(user, id, true, body?.comment);
  }

  @Post("reversals/:id/reject")
  @RequirePermissions(PermissionKey.ApprovalReview)
  rejectReversal(@CurrentUserParam() user: CurrentUser, @Param("id") id: string, @Body() body: { comment?: string | null }) {
    return this.finance.decideReversal(user, id, false, body?.comment);
  }

  @Post("adjustments")
  @RequirePermissions(PermissionKey.FinanceManage)
  createAdjustment(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.finance.createAdjustment(user, body);
  }

  @Get("budgets")
  @RequirePermissions(PermissionKey.FinanceRead)
  budgets(@CurrentUserParam() user: CurrentUser) {
    return this.finance.budgets(user.schoolId);
  }

  @Post("budgets")
  @RequirePermissions(PermissionKey.BudgetManage)
  createBudget(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.finance.createBudget(user, body);
  }

  @Post("budget-requests")
  @RequirePermissions(PermissionKey.BudgetManage)
  createBudgetRequest(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.finance.createBudgetRequest(user, body);
  }

  @Get("expenses")
  @RequirePermissions(PermissionKey.FinanceRead)
  expenses(@CurrentUserParam() user: CurrentUser, @Query() query: Record<string, string | undefined>) {
    return this.finance.expenses(user.schoolId, query);
  }

  @Post("expenses")
  @RequirePermissions(PermissionKey.FinanceManage)
  createExpense(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.finance.createExpense(user, body);
  }

  @Get("students/:studentId/profile")
  @RequirePermissions(PermissionKey.FinanceRead)
  studentFinanceProfile(@CurrentUserParam() user: CurrentUser, @Param("studentId") studentId: string, @Query() query: Record<string, string | undefined>) {
    return this.finance.studentFinanceProfile(user.schoolId, studentId, query);
  }

  @Get("settings")
  @RequirePermissions(PermissionKey.FinanceRead)
  settings(@CurrentUserParam() user: CurrentUser) {
    return this.finance.settings(user.schoolId);
  }

  @Post("settings")
  @RequirePermissions(PermissionKey.FinanceManage)
  updateSettings(@CurrentUserParam() user: CurrentUser, @Body() body: unknown) {
    return this.finance.updateSettings(user, body);
  }

  @Get("reports/:type")
  @RequirePermissions(PermissionKey.FinanceRead)
  report(@CurrentUserParam() user: CurrentUser, @Param("type") type: string, @Query() query: Record<string, string | undefined>) {
    return this.finance.report(user.schoolId, type, query);
  }
}
