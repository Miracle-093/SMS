import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { CurrentUser } from "@aethina/shared-types";
import { announcementSchema } from "@aethina/validation";
import { AuthGuard } from "../src/common/auth.guard.js";
import { NotificationsService } from "../src/notifications/notifications.service.js";
import { PortalService } from "../src/portal/portal.service.js";

const schoolId = "11111111-1111-4111-8111-111111111111";
const otherSchoolId = "22222222-2222-4222-8222-222222222222";
const studentId = "33333333-3333-4333-8333-333333333333";
const classId = "44444444-4444-4444-8444-444444444444";
const streamId = "55555555-5555-4555-8555-555555555555";

const portalUser: CurrentUser = {
  id: studentId,
  schoolId,
  email: "student@example.test",
  displayName: "Student Example",
  roles: ["PORTAL_USER"],
  permissions: [],
  mustChangePassword: false
};

describe("portal authorization regressions", () => {
  it("returns only school-wide broadcasts and notifications directly addressed to the portal student", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "school-broadcast", recipientType: "PORTAL", recipientId: null },
      { id: "own-direct", recipientType: "STUDENT", recipientId: studentId }
    ]);
    const service = new PortalService({ notification: { findMany } } as never, {} as never, {} as never);

    const notifications = await service.notifications(portalUser);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        schoolId,
        OR: [
          { recipientType: { in: ["ALL", "PORTAL", "STUDENT", "STUDENTS", "GUARDIANS"] }, recipientId: null },
          { recipientType: "STUDENT", recipientId: studentId }
        ]
      })
    }));
    expect(notifications).toEqual([
      expect.objectContaining({ id: "school-broadcast", canMarkRead: false }),
      expect.objectContaining({ id: "own-direct", canMarkRead: true })
    ]);
  });

  it("does not allow a portal student to mark another student's or a broadcast notification read", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    const service = new PortalService({ notification: { findFirst, update } } as never, {} as never, {} as never);

    await expect(service.markNotificationRead(portalUser, "someone-elses-notification")).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "someone-elses-notification", schoolId, recipientType: "STUDENT", recipientId: studentId, deletedAt: null }
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("uses explicit school, class, and stream targets for announcements", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new PortalService({
      student: { findFirstOrThrow: vi.fn().mockResolvedValue({ currentClassId: classId, currentStreamId: streamId }) },
      announcement: { findMany }
    } as never, {} as never, {} as never);

    await service.announcements(portalUser);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        schoolId,
        AND: [{ OR: [
          { audience: { in: ["ALL", "PORTAL", "STUDENTS", "GUARDIANS"] }, classId: null, streamId: null },
          { audience: "CLASS", classId, streamId: null },
          { audience: "STREAM", classId, streamId }
        ] }]
      })
    }));
  });

  it("rejects ambiguous announcement targets before persistence", () => {
    const base = { title: "Portal notice", message: "A clear target is required.", priority: "NORMAL", publishAt: "2026-10-05T12:00:00.000Z" };

    expect(announcementSchema.safeParse({ ...base, audience: "ALL", classId }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, audience: "CLASS", classId, streamId }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, audience: "STREAM", classId }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, audience: "STREAM", classId, streamId }).success).toBe(true);
  });

  it.each([
    ["class", { class: { findFirst: vi.fn().mockResolvedValue(null) }, announcement: { create: vi.fn() } }, { audience: "CLASS", classId }],
    ["stream", { class: { findFirst: vi.fn().mockResolvedValue({ id: classId }) }, stream: { findFirst: vi.fn().mockResolvedValue(null) }, announcement: { create: vi.fn() } }, { audience: "STREAM", classId, streamId }],
    ["academic year", { academicYear: { findFirst: vi.fn().mockResolvedValue(null) }, announcement: { create: vi.fn() } }, { audience: "ALL", academicYearId: "66666666-6666-4666-8666-666666666666" }]
  ])("rejects a cross-school announcement %s target before persistence", async (_target, prisma, target) => {
    const service = new NotificationsService(prisma as never, { record: vi.fn() } as never);
    const body = {
      title: "Portal notice",
      message: "A clear target is required.",
      priority: "NORMAL",
      publishAt: "2026-10-05T12:00:00.000Z",
      ...target
    };

    await expect(service.createAnnouncement(portalUser, body)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it.each([
    ["disabled credential", { credentialActive: false }],
    ["inactive student", { studentStatus: "INACTIVE" }],
    ["inactive school", { schoolActive: false }],
    ["cross-school token", { tokenSchoolId: otherSchoolId }]
  ])("rejects an existing portal token when access is revoked: %s", async (_name, state) => {
    const request = { headers: { authorization: "Bearer portal-token" } } as { headers: Record<string, string>; user?: unknown };
    const token = { ...portalUser, schoolId: state.tokenSchoolId ?? schoolId };
    const credential = portalCredential({
      isActive: state.credentialActive ?? true,
      status: state.studentStatus ?? "ACTIVE",
      schoolActive: state.schoolActive ?? true
    });
    const findFirst = vi.fn().mockImplementation(({ where }) => {
      const isEligible = where.studentId === credential.student.id
        && where.isActive === true
        && where.student.schoolId === credential.student.schoolId
        && where.student.status === "ACTIVE"
        && where.student.deletedAt === null
        && where.student.school.isActive === true
        && credential.isActive
        && credential.student.status === "ACTIVE"
        && credential.student.school.isActive;
      return Promise.resolve(isEligible ? credential : null);
    });
    const guard = new AuthGuard({ verify: vi.fn().mockReturnValue(token) } as never, { studentPortalCredential: { findFirst } } as never);

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rehydrates a still-active portal session and leaves staff revalidation intact", async () => {
    const portalRequest = { headers: { authorization: "Bearer portal-token" } } as { headers: Record<string, string>; user?: unknown };
    const staffRequest = { headers: { authorization: "Bearer staff-token" } } as { headers: Record<string, string>; user?: unknown };
    const credentialFindFirst = vi.fn().mockResolvedValue(portalCredential());
    const staffFindFirst = vi.fn().mockResolvedValue({
      id: "staff-id", schoolId, email: "staff@example.test", displayName: "Staff Example", isActive: true, mustChangePassword: false,
      roles: [{ role: { name: "ADMIN", permissions: [{ permission: { key: "students.read" } }] } }]
    });
    const guard = new AuthGuard({
      verify: vi.fn((value: string) => value === "portal-token" ? portalUser : { ...portalUser, id: "staff-id", roles: ["ADMIN"] })
    } as never, { studentPortalCredential: { findFirst: credentialFindFirst }, user: { findFirst: staffFindFirst } } as never);

    await expect(guard.canActivate(contextFor(portalRequest))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(staffRequest))).resolves.toBe(true);
    expect(portalRequest.user).toMatchObject({ ...portalUser, mustChangePassword: true });
    expect(staffRequest.user).toMatchObject({ id: "staff-id", roles: ["ADMIN"], permissions: ["students.read"] });
  });
});

function portalCredential(options: { isActive?: boolean; status?: string; schoolActive?: boolean } = {}) {
  return {
    username: "student@example.test",
    mustReset: true,
    isActive: options.isActive ?? true,
    student: {
      id: studentId,
      schoolId,
      firstName: "Student",
      lastName: "Example",
      status: options.status ?? "ACTIVE",
      school: { isActive: options.schoolActive ?? true }
    }
  };
}

function contextFor(request: { headers: Record<string, string>; user?: unknown }) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as never;
}
