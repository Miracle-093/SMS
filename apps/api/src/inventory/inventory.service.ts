import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus, SyncStatus, type CurrentUser } from "@aethina/shared-types";
import { inventoryItemSchema, stockMovementSchema } from "@aethina/validation";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class InventoryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  items(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.inventoryItem.findMany({
      where: { schoolId, deletedAt: null, isActive: query.active === undefined ? undefined : query.active === "true", category: query.category, name: query.search ? { contains: query.search, mode: "insensitive" } : undefined },
      include: { stockMovements: { orderBy: { occurredAt: "desc" }, take: 5 } },
      orderBy: [{ category: "asc" }, { name: "asc" }]
    });
  }

  async createItem(actor: CurrentUser, body: unknown) {
    const input = inventoryItemSchema.parse(body);
    const item = await this.prisma.inventoryItem.upsert({
      where: { schoolId_sku: { schoolId: actor.schoolId, sku: input.sku } },
      update: { ...input, description: input.description ?? null, storageLocation: input.storageLocation ?? null, version: { increment: 1 } },
      create: { schoolId: actor.schoolId, createdBy: actor.id, ...input, description: input.description ?? null, storageLocation: input.storageLocation ?? null, syncStatus: SyncStatus.Synced, approvalStatus: ApprovalStatus.Approved, lastSyncedAt: new Date() }
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "INVENTORY_ITEM_UPSERTED", entityType: "INVENTORY_ITEM", entityId: item.id, newValue: item });
    return item;
  }

  suppliers(schoolId: string) {
    return this.prisma.inventorySupplier.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
  }

  async createSupplier(actor: CurrentUser, body: { name: string; phone?: string; email?: string; address?: string }) {
    return this.prisma.inventorySupplier.upsert({
      where: { schoolId_name: { schoolId: actor.schoolId, name: body.name } },
      update: { phone: body.phone ?? null, email: body.email ?? null, address: body.address ?? null },
      create: { schoolId: actor.schoolId, name: body.name, phone: body.phone ?? null, email: body.email ?? null, address: body.address ?? null }
    });
  }

  movements(schoolId: string, query: Record<string, string | undefined>) {
    return this.prisma.stockMovement.findMany({ where: { schoolId, inventoryItemId: query.itemId, approvalStatus: query.status as never, deletedAt: null }, include: { inventoryItem: true }, orderBy: { occurredAt: "desc" }, take: 200 });
  }

  async createMovement(actor: CurrentUser, body: unknown) {
    const input = stockMovementSchema.parse(body);
    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, schoolId: actor.schoolId, deletedAt: null } });
      if (!item) throw new NotFoundException("Inventory item not found.");
      const delta = quantityDelta(input.movementType, input.quantity);
      const newQuantity = item.quantity + delta;
      if (newQuantity < 0) {
        await tx.riskAlert.create({ data: { schoolId: actor.schoolId, category: "NEGATIVE_STOCK", severity: "HIGH", entityType: "INVENTORY_ITEM", entityId: item.id, amount: input.quantity, userId: actor.id, reason: "Stock movement would make quantity negative." } });
        throw new BadRequestException("Stock movement cannot make inventory negative.");
      }
      const movement = await tx.stockMovement.create({
        data: {
          schoolId: actor.schoolId,
          createdBy: actor.id,
          inventoryItemId: item.id,
          movementType: input.movementType,
          quantity: input.quantity,
          unitCost: input.unitCost ?? null,
          supplierId: input.supplierId ?? null,
          departmentOrPerson: input.departmentOrPerson ?? null,
          reference: input.reference ?? null,
          reason: input.reason,
          occurredAt: new Date(input.occurredAt),
          approvalStatus: input.approvalStatus as ApprovalStatus,
          syncStatus: SyncStatus.Synced,
          lastSyncedAt: new Date(),
          approvedBy: input.approvalStatus === "APPROVED" ? actor.id : null,
          approvedAt: input.approvalStatus === "APPROVED" ? new Date() : null
        }
      });
      if (input.approvalStatus === "APPROVED") {
        await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: newQuantity, version: { increment: 1 }, syncStatus: SyncStatus.Synced, lastSyncedAt: new Date() } });
      } else {
        await tx.approvalWorkflow.create({ data: { schoolId: actor.schoolId, entityType: "STOCK_MOVEMENT", entityId: movement.id, requestedBy: actor.id, status: "SUBMITTED" } });
      }
      if (newQuantity <= item.reorderLevel || input.movementType === "ADJUSTMENT" || input.movementType === "WRITE_OFF") {
        await tx.riskAlert.create({ data: { schoolId: actor.schoolId, category: "INVENTORY_CONTROL", severity: newQuantity <= item.reorderLevel ? "MEDIUM" : "LOW", entityType: "STOCK_MOVEMENT", entityId: movement.id, amount: input.quantity, userId: actor.id, reason: newQuantity <= item.reorderLevel ? "Item is at or below reorder level." : "Inventory adjustment requires review trail." } });
      }
      return movement;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: "STOCK_MOVEMENT_CREATED", entityType: "STOCK_MOVEMENT", entityId: result.id, newValue: result });
    return result;
  }

  async approveMovement(actor: CurrentUser, id: string, approved: boolean) {
    const movement = await this.prisma.stockMovement.findFirst({ where: { id, schoolId: actor.schoolId }, include: { inventoryItem: true } });
    if (!movement) throw new NotFoundException("Stock movement not found.");
    if (movement.createdBy === actor.id) throw new BadRequestException("Requester cannot approve their own stock movement.");
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.stockMovement.update({ where: { id }, data: { approvalStatus: approved ? ApprovalStatus.Approved : ApprovalStatus.Rejected, approvedBy: actor.id, approvedAt: new Date(), version: { increment: 1 } } });
      await tx.approvalWorkflow.updateMany({ where: { entityType: "STOCK_MOVEMENT", entityId: id }, data: { status: approved ? "APPROVED" : "REJECTED", decision: approved ? "APPROVED" : "REJECTED", decisionDate: new Date() } });
      if (approved) await tx.inventoryItem.update({ where: { id: movement.inventoryItemId }, data: { quantity: movement.inventoryItem.quantity + quantityDelta(movement.movementType, movement.quantity), version: { increment: 1 } } });
      return row;
    });
    await this.audit.record({ schoolId: actor.schoolId, actorId: actor.id, action: approved ? "STOCK_MOVEMENT_APPROVED" : "STOCK_MOVEMENT_REJECTED", entityType: "STOCK_MOVEMENT", entityId: id });
    return updated;
  }

  async report(schoolId: string, type: string) {
    if (type === "low-stock") {
      return this.prisma.$queryRaw`
        SELECT * FROM "InventoryItem"
        WHERE "schoolId" = ${schoolId}
          AND "deletedAt" IS NULL
          AND "quantity" <= "reorderLevel"
        ORDER BY "name" ASC
      `;
    }
    if (type === "valuation") {
      const items = await this.prisma.inventoryItem.findMany({ where: { schoolId, deletedAt: null } });
      return { totalValue: items.reduce((sum, item) => sum + item.quantity * money(item.unitCost), 0), items };
    }
    if (type === "movements") return this.movements(schoolId, {});
    throw new NotFoundException("Inventory report not found.");
  }
}

function quantityDelta(type: string, quantity: number) {
  return type === "IN" ? quantity : type === "OUT" || type === "DAMAGED" || type === "MISSING" || type === "WRITE_OFF" ? -quantity : quantity;
}

function money(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "object" && "toNumber" in value ? value.toNumber() : Number(value);
}
