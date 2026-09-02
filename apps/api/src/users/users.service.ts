import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AcademicLevelBand } from "@prisma/client";
import { adminPasswordResetSchema, adminUserCreateSchema, adminUserRolesSchema } from "@aethina/validation";
import type { CurrentUser } from "@aethina/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { PasswordService } from "../auth/password.service.js";

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PasswordService) private readonly passwords: PasswordService
  ) {}

  list(schoolId: string) {
    return this.prisma.user.findMany({
      where: { schoolId },
      select: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
        mustChangePassword: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        lastLoginAt: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
        academicScopeAssignments: { where: { isActive: true }, select: { id: true, band: true, minLevel: true, maxLevel: true } }
      },
      orderBy: { displayName: "asc" }
    });
  }

  roles(schoolId: string) {
    return this.prisma.role.findMany({
      where: { schoolId },
      select: {
        id: true,
        name: true,
        description: true,
        permissions: { select: { permission: { select: { key: true } } }, orderBy: { permission: { key: "asc" } } },
        _count: { select: { users: true } }
      },
      orderBy: { name: "asc" }
    });
  }

  academicScopes(schoolId: string) {
    return this.prisma.academicScopeAssignment.findMany({
      where: { schoolId },
      include: { user: { select: { id: true, displayName: true, email: true, roles: { select: { role: { select: { name: true } } } } } } },
      orderBy: [{ user: { displayName: "asc" } }, { band: "asc" }]
    });
  }

  async create(actor: CurrentUser, body: unknown) {
    const input = adminUserCreateSchema.parse(body);
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("A user with this email already exists.");
    }
    const roles = await this.rolesForSchool(actor.schoolId, input.roleIds);
    const user = await this.prisma.user.create({
      data: {
        schoolId: actor.schoolId,
        email,
        displayName: input.displayName.trim(),
        passwordHash: this.passwords.hash(input.temporaryPassword),
        mustChangePassword: true,
        roles: { create: roles.map((role) => ({ roleId: role.id })) }
      },
      select: this.userSelect()
    });
    await this.audit.record({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: user.id,
      newValue: { email, displayName: user.displayName, roles: roles.map((role) => role.name) }
    });
    return user;
  }

  async setActive(actor: CurrentUser, userId: string, isActive: boolean) {
    if (!isActive && actor.id === userId) {
      throw new BadRequestException("You cannot deactivate your own active session.");
    }
    const previous = await this.prisma.user.findFirst({ where: { id: userId, schoolId: actor.schoolId } });
    if (!previous) {
      throw new NotFoundException("User not found.");
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive, deactivatedAt: isActive ? null : new Date(), lockedUntil: null }
    });
    await this.audit.record({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      entityType: "USER",
      entityId: userId,
      previousValue: { isActive: previous.isActive },
      newValue: { isActive }
    });
    return { id: updated.id, isActive: updated.isActive };
  }

  async resetPassword(actor: CurrentUser, body: unknown) {
    const input = adminPasswordResetSchema.parse(body);
    const user = await this.prisma.user.findFirst({ where: { id: input.userId, schoolId: actor.schoolId } });
    if (!user) {
      throw new NotFoundException("User not found.");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: this.passwords.hash(input.temporaryPassword),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });
    await this.audit.record({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "USER_PASSWORD_RESET",
      entityType: "USER",
      entityId: user.id
    });
    return { id: user.id, mustChangePassword: true };
  }

  async assignRoles(actor: CurrentUser, userId: string, body: unknown) {
    if (actor.id === userId) {
      throw new BadRequestException("You cannot change roles for your own active session.");
    }
    const input = adminUserRolesSchema.parse(body);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, schoolId: actor.schoolId },
      include: { roles: { include: { role: true } } }
    });
    if (!user) {
      throw new NotFoundException("User not found.");
    }
    const roles = await this.rolesForSchool(actor.schoolId, input.roleIds);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({ data: roles.map((role) => ({ userId, roleId: role.id })), skipDuplicates: true });
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: this.userSelect()
      });
    });
    await this.audit.record({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "USER_ROLES_UPDATED",
      entityType: "USER",
      entityId: userId,
      previousValue: { roles: user.roles.map((item) => item.role.name) },
      newValue: { roles: roles.map((role) => role.name) }
    });
    return updated;
  }

  async assignAcademicScopes(actor: CurrentUser, userId: string, body: unknown) {
    const input = parseAcademicScopeAssignment(body);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, schoolId: actor.schoolId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
    });
    if (!user) throw new NotFoundException("User not found.");
    if (!this.canReceiveAcademicScope(user.roles)) {
      throw new BadRequestException("Academic scope can only be assigned to Dean of Studies or academic administrator users.");
    }
    const bandRanges = {
      LOWER: { minLevel: 1, maxLevel: 2 },
      MIDDLE: { minLevel: 3, maxLevel: 4 },
      UPPER: { minLevel: 5, maxLevel: 6 }
    } as const;
    const uniqueBands = Array.from(new Set(input.bands));
    const scopes = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const band of uniqueBands) {
        const range = bandRanges[band];
        rows.push(await tx.academicScopeAssignment.upsert({
          where: { userId_band: { userId, band } },
          update: { schoolId: actor.schoolId, minLevel: range.minLevel, maxLevel: range.maxLevel, isActive: true },
          create: { schoolId: actor.schoolId, userId, band, minLevel: range.minLevel, maxLevel: range.maxLevel }
        }));
      }
      return rows;
    });
    await this.audit.record({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "USER_ACADEMIC_SCOPE_ASSIGNED",
      entityType: "USER",
      entityId: userId,
      newValue: { bands: uniqueBands }
    });
    return scopes;
  }

  async deactivateAcademicScope(actor: CurrentUser, scopeId: string) {
    const scope = await this.prisma.academicScopeAssignment.findFirst({ where: { id: scopeId, schoolId: actor.schoolId } });
    if (!scope) throw new NotFoundException("Academic scope assignment not found.");
    const updated = await this.prisma.academicScopeAssignment.update({
      where: { id: scope.id },
      data: { isActive: false }
    });
    await this.audit.record({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "USER_ACADEMIC_SCOPE_DEACTIVATED",
      entityType: "USER",
      entityId: scope.userId,
      previousValue: scope,
      newValue: { id: updated.id, isActive: updated.isActive }
    });
    return updated;
  }

  private async rolesForSchool(schoolId: string, roleIds: string[]) {
    const uniqueRoleIds = Array.from(new Set(roleIds));
    const roles = await this.prisma.role.findMany({
      where: { schoolId, id: { in: uniqueRoleIds } },
      select: { id: true, name: true }
    });
    if (roles.length !== uniqueRoleIds.length) {
      throw new BadRequestException("One or more roles do not belong to this school.");
    }
    return roles;
  }

  private userSelect() {
    return {
      id: true,
      email: true,
      displayName: true,
      isActive: true,
      mustChangePassword: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      lastLoginAt: true,
      roles: { select: { role: { select: { id: true, name: true } } } },
      academicScopeAssignments: { where: { isActive: true }, select: { id: true, band: true, minLevel: true, maxLevel: true } }
    } as const;
  }

  private canReceiveAcademicScope(roles: Array<{ role: { name: string; permissions: Array<{ permission: { key: string } }> } }>) {
    return roles.some((item) => {
      const roleName = item.role.name.toLowerCase();
      const permissions = new Set(item.role.permissions.map((permission) => permission.permission.key));
      return roleName.includes("dean of studies") || roleName.includes("dos") ||
        (permissions.has("academic-setup.manage") && permissions.has("report-cards.publish"));
    });
  }
}

type AcademicScopeBand = keyof typeof AcademicLevelBand;

function parseAcademicScopeAssignment(body: unknown): { bands: AcademicScopeBand[] } {
  const bands = Array.isArray((body as { bands?: unknown })?.bands) ? (body as { bands: unknown[] }).bands : [];
  const allowed = new Set<string>(Object.values(AcademicLevelBand));
  const parsed = bands.filter((band): band is AcademicScopeBand => typeof band === "string" && allowed.has(band));
  if (parsed.length === 0) throw new BadRequestException("Choose at least one academic scope.");
  if (parsed.length !== bands.length) throw new BadRequestException("Academic scope must be lower, middle, or upper school.");
  return { bands: parsed };
}
