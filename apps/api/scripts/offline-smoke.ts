import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { SyncEntityType } from "@aethina/shared-types";
import { AppModule } from "../src/app.module.js";
import { loadRootEnv } from "./env.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

loadRootEnv();

const deviceId = "00000000-0000-4000-8000-000000000001";

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ["error"] });
  await app.listen(0);
  const url = await app.getUrl();
  const prisma = app.get(PrismaService);

  const school = await prisma.school.findUniqueOrThrow({ where: { code: "AETHINA-DEMO" } });
  const inventoryItem = await prisma.inventoryItem.findFirstOrThrow({ where: { schoolId: school.id } });
  const staleInventoryVersion = inventoryItem.version;
  const currentInventoryItem = await prisma.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: { version: { increment: 1 } }
  });

  const guardianChangeId = randomUUID();
  const guardianEntityId = randomUUID();
  const guardianPayload = {
    fullName: "Offline Smoke Guardian",
    phone: "+254711111111",
    email: "offline.guardian@example.test",
    createdBy: null,
    approvalStatus: "APPROVED"
  };

  const pushBody = {
    deviceId,
    schoolId: school.id,
    changes: [
      {
        id: guardianChangeId,
        entityType: SyncEntityType.Guardian,
        entityId: guardianEntityId,
        operation: "CREATE",
        payload: guardianPayload,
        baseVersion: null,
        createdAt: new Date().toISOString(),
        retryCount: 0
      }
    ]
  };

  const token = await login(`${url}/auth/login`);
  const firstPush = await post(`${url}/sync/push`, pushBody, token);
  const duplicatePush = await post(`${url}/sync/push`, pushBody, token);

  const conflictPush = await post(`${url}/sync/push`, {
    deviceId,
    schoolId: school.id,
    changes: [
      {
        id: randomUUID(),
        entityType: SyncEntityType.InventoryItem,
        entityId: inventoryItem.id,
        operation: "UPDATE",
        payload: { quantity: currentInventoryItem.quantity + 3 },
        baseVersion: staleInventoryVersion,
        createdAt: new Date().toISOString(),
        retryCount: 0
      }
    ]
  }, token);

  const pull = await post(`${url}/sync/pull`, { deviceId, schoolId: school.id, since: null }, token);
  const conflict = await prisma.synchronizationConflict.findFirst({
    where: { schoolId: school.id, entityId: inventoryItem.id },
    orderBy: { createdAt: "desc" }
  });

  await app.close();

  console.log(JSON.stringify({
    firstPushStatus: firstPush.results?.[0]?.status,
    duplicateProtected: duplicatePush.results?.[0]?.duplicate === true,
    conflictStatus: conflictPush.results?.[0]?.status,
    conflictSensitivity: conflict?.sensitivity,
    pulledGuardianCount: pull.records?.guardians?.length ?? 0
  }, null, 2));
}

async function login(url: string) {
  const response = await post(url, {
    email: "admin@aethina.test",
    password: "AdminPass123",
    deviceId
  });
  if (!response.accessToken) throw new Error("Seeded admin login did not return an access token.");
  return response.accessToken as string;
}

async function post(url: string, body: unknown, token?: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
