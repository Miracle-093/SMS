import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { loginSchema, passwordChangeSchema, portalLoginSchema } from "@aethina/validation";
import type { CurrentUser } from "@aethina/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";

const lockoutThreshold = 5;
const lockoutMinutes = 15;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService
  ) {}

  async login(body: unknown) {
    const input = loginSchema.parse(body);
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid email or password.");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException("Account is temporarily locked.");
    }
    if (!this.passwords.verify(input.password, user.passwordHash)) {
      const attempts = user.failedLoginAttempts + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= lockoutThreshold ? new Date(Date.now() + lockoutMinutes * 60_000) : null
        }
      });
      await this.audit.record({
        schoolId: user.schoolId,
        actorId: user.id,
        deviceId: input.deviceId ?? null,
        action: "AUTH_LOGIN_FAILED",
        entityType: "USER",
        entityId: user.id,
        metadata: { email: input.email }
      });
      throw new UnauthorizedException("Invalid email or password.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }
    });

    const currentUser = this.toCurrentUser(user);
    await this.audit.record({
      schoolId: user.schoolId,
      actorId: user.id,
      deviceId: input.deviceId ?? null,
      action: "AUTH_LOGIN_SUCCEEDED",
      entityType: "USER",
      entityId: user.id
    });

    return { accessToken: this.tokens.sign(currentUser), user: currentUser };
  }

  async portalLogin(body: unknown) {
    const input = portalLoginSchema.parse(body);
    const portal = await this.prisma.studentPortalCredential.findUnique({
      where: { username: input.username.toLowerCase() },
      include: { student: true }
    });
    if (!portal || !portal.isActive || portal.student.deletedAt) {
      throw new UnauthorizedException("Invalid username or password.");
    }
    if (portal.lockedUntil && portal.lockedUntil > new Date()) {
      throw new UnauthorizedException("Portal account is temporarily locked.");
    }
    if (!this.passwords.verify(input.password, portal.passwordHash)) {
      const attempts = portal.failedLoginAttempts + 1;
      await this.prisma.studentPortalCredential.update({
        where: { id: portal.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= lockoutThreshold ? new Date(Date.now() + lockoutMinutes * 60_000) : null
        }
      });
      await this.audit.record({
        schoolId: portal.student.schoolId,
        actorId: portal.student.id,
        deviceId: input.deviceId ?? null,
        action: "PORTAL_LOGIN_FAILED",
        entityType: "STUDENT",
        entityId: portal.student.id
      });
      throw new UnauthorizedException("Invalid username or password.");
    }
    await this.prisma.studentPortalCredential.update({
      where: { id: portal.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }
    });
    const currentUser: CurrentUser = {
      id: portal.student.id,
      schoolId: portal.student.schoolId,
      email: portal.username,
      displayName: `${portal.student.firstName} ${portal.student.lastName}`,
      roles: ["PORTAL_USER"],
      permissions: [],
      mustChangePassword: portal.mustReset
    };
    await this.audit.record({
      schoolId: portal.student.schoolId,
      actorId: portal.student.id,
      deviceId: input.deviceId ?? null,
      action: "PORTAL_LOGIN_SUCCEEDED",
      entityType: "STUDENT",
      entityId: portal.student.id
    });
    return { accessToken: this.tokens.sign(currentUser), user: currentUser };
  }

  async logout(user: CurrentUser, deviceId?: string | null) {
    await this.audit.record({
      schoolId: user.schoolId,
      actorId: user.id,
      deviceId: deviceId ?? null,
      action: "AUTH_LOGOUT",
      entityType: "USER",
      entityId: user.id
    });
    return { ok: true };
  }

  async changePassword(user: CurrentUser, body: unknown) {
    const input = passwordChangeSchema.parse(body);
    const persisted = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!this.passwords.verify(input.currentPassword, persisted.passwordHash)) {
      throw new UnauthorizedException("Current password is incorrect.");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: this.passwords.hash(input.newPassword), mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null }
    });
    await this.audit.record({
      schoolId: user.schoolId,
      actorId: user.id,
      action: "AUTH_PASSWORD_CHANGED",
      entityType: "USER",
      entityId: user.id
    });
    return { ok: true };
  }

  private toCurrentUser(user: {
    id: string;
    schoolId: string;
    email: string;
    displayName: string;
    mustChangePassword: boolean;
    roles: Array<{ role: { name: string; permissions: Array<{ permission: { key: string } }> } }>;
  }): CurrentUser {
    const roles = user.roles.map((role) => role.role.name);
    const permissions = Array.from(new Set(user.roles.flatMap((role) => role.role.permissions.map((permission) => permission.permission.key))));
    return {
      id: user.id,
      schoolId: user.schoolId,
      email: user.email,
      displayName: user.displayName,
      roles,
      permissions,
      mustChangePassword: user.mustChangePassword
    };
  }
}
