# Aethina SMS Architecture

Aethina SMS is organized as a monorepo with a Windows desktop application, a responsive portal, a backend API, and shared packages.

## Applications

- `apps/desktop`: React + Tauri desktop application with local SQLite storage for offline Phase 1 workflows.
- `apps/portal`: React Student/Parent Portal for online access.
- `apps/api`: NestJS API, Prisma ORM, PostgreSQL schema management, seeding, and synchronization endpoints.

## Packages

- `packages/shared-types`: Shared TypeScript interfaces and enums.
- `packages/validation`: Shared Zod validation schemas used by clients and API.

## Phase 1 Scope

Phase 1 includes academic setup, student/guardian records, teacher attendance, finance, budgets, approvals, financial risk monitoring, inventory seed data, audit logs, devices, and synchronization.

## Finance and Control Plane

The finance milestone adds backend-owned aggregates and transactional workflows:

- Dashboard aggregates come from NestJS endpoints rather than React-side table math.
- Payment recording atomically creates a payment, updates invoice balances, creates a receipt, evaluates risk rules, and writes audit history.
- Reversals, fee waivers, expenses, and budget requests are approval-backed. Original financial transactions remain intact.
- Financial controls are stored in `FinancialSetting` instead of hardcoded thresholds.
- `ApprovalWorkflow` is generic and can be reused by future procurement, payroll, inventory adjustment, and other approval-backed records.
- `RiskAlert` records are reviewable but not silently deleted.

Student attendance is intentionally excluded from the active Phase 1 application. The data model keeps devices and synchronization extensibility so future hardware-backed student attendance can be introduced without reshaping the sync architecture.
