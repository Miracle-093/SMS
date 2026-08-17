import { describe, expect, it } from "vitest";
import { ConflictSensitivity, SyncEntityType } from "@aethina/shared-types";

const sensitiveEntities = new Set<string>([
  SyncEntityType.Payment,
  SyncEntityType.PaymentReversal,
  SyncEntityType.BudgetRequest,
  SyncEntityType.InventoryItem,
  SyncEntityType.StockMovement,
  SyncEntityType.PayrollRecord
]);

describe("offline synchronization rules", () => {
  it("routes sensitive version conflicts to administrator review", () => {
    expect(sensitiveEntities.has(SyncEntityType.Payment)).toBe(true);
    expect(sensitiveEntities.has(SyncEntityType.PayrollRecord)).toBe(true);
    expect(ConflictSensitivity.Sensitive).toBe("SENSITIVE");
  });

  it("keeps student attendance out of Phase 1 sync entities", () => {
    expect(Object.values(SyncEntityType)).not.toContain("STUDENT_ATTENDANCE");
  });
});
