import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { CurrentUser, SyncEntityType } from "@aethina/shared-types";
import { AuthGuard } from "../src/common/auth.guard.js";
import { TokenService } from "../src/auth/token.service.js";
import { SyncController } from "../src/sync/sync.controller.js";
import { SyncService } from "../src/sync/sync.service.js";

const userSchoolId = "11111111-1111-4111-8111-111111111111";
const bodySchoolId = "22222222-2222-4222-8222-222222222222";
const deviceId = "00000000-0000-4000-8000-000000000001";

const currentUser: CurrentUser = {
  id: "33333333-3333-4333-8333-333333333333",
  schoolId: userSchoolId,
  email: "sync-reviewer@aethina.test",
  displayName: "Sync Reviewer",
  roles: ["ADMIN"],
  permissions: [],
  mustChangePassword: false
};

describe("Security stabilization regressions", () => {
  let app: INestApplication;
  let baseUrl: string;
  let token: string;
  let capturedPullInput: unknown;

  beforeAll(async () => {
    const config = { get: (key: string) => key === "JWT_SECRET" ? "test-secret" : undefined };
    const tokenService = new TokenService(config as ConfigService);

    const moduleRef = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        AuthGuard,
        { provide: ConfigService, useValue: config },
        { provide: TokenService, useValue: tokenService },
        {
          provide: SyncService,
          useValue: {
            push: async (_user: CurrentUser, input: unknown) => ({ accepted: 0, input }),
            pull: async (_user: CurrentUser, input: unknown) => {
              capturedPullInput = input;
              return { pulledAt: new Date(0).toISOString(), records: {}, input };
            },
            retryFailed: async (user: CurrentUser, receivedDeviceId: string) => ({ schoolId: user.schoolId, deviceId: receivedDeviceId })
          }
        }
      ]
    }).compile();

    token = tokenService.sign(currentUser);
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("rejects unauthenticated sync write and read endpoints", async () => {
    const push = await post("/sync/push", { deviceId, schoolId: userSchoolId, changes: [] });
    const pull = await post("/sync/pull", { deviceId, schoolId: userSchoolId, since: null });
    const retry = await post("/sync/retry", { deviceId, schoolId: userSchoolId });

    expect(push.status).toBe(403);
    expect(pull.status).toBe(403);
    expect(retry.status).toBe(403);
  });

  it("derives sync tenant scope from the authenticated user instead of the request body", async () => {
    const response = await post("/sync/pull", { deviceId, schoolId: bodySchoolId, since: null }, token);

    expect(response.status).toBe(200);
    expect(capturedPullInput).toMatchObject({ deviceId, schoolId: userSchoolId, since: null });
  });

  it("refuses to sign JWTs when JWT_SECRET is missing", () => {
    const missingSecretConfig = { get: () => undefined };
    const service = new TokenService(missingSecretConfig as unknown as ConfigService);

    expect(() => service.sign(currentUser)).toThrow(/JWT_SECRET/i);
  });

  it("fails sync changes that target an entity owned by another school", async () => {
    const update = vi.fn();
    const service = new SyncService({
      synchronizationRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "44444444-4444-4444-8444-444444444444",
          schoolId: userSchoolId,
          deviceId,
          entityType: SyncEntityType.Guardian,
          entityId: "55555555-5555-4555-8555-555555555555",
          operation: "UPDATE",
          payload: { fullName: "Cross School Edit" },
          baseVersion: null
        }),
        update
      },
      guardian: {
        findUnique: vi.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555", schoolId: bodySchoolId })
      }
    } as never, {} as never, {} as never);

    const result = await service.push(currentUser, {
      deviceId,
      schoolId: userSchoolId,
      changes: [{
        id: "44444444-4444-4444-8444-444444444444",
        entityType: SyncEntityType.Guardian,
        entityId: "55555555-5555-4555-8555-555555555555",
        operation: "UPDATE",
        payload: { fullName: "Cross School Edit" },
        baseVersion: null,
        createdAt: new Date().toISOString(),
        retryCount: 0
      }]
    });

    expect(result.results[0]).toMatchObject({
      id: "44444444-4444-4444-8444-444444444444",
      status: "FAILED",
      error: "Synchronized entity does not belong to this school."
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "44444444-4444-4444-8444-444444444444" },
      data: expect.objectContaining({ status: "FAILED" })
    });
  });

  function post(path: string, body: unknown, accessToken?: string) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify(body)
    });
  }
});
