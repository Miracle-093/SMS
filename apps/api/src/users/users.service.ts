import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { adminPasswordResetSchema } from "@aethina/validation";
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
        roles: { select: { role: { select: { name: true } } } }
      },
      orderBy: { displayName: "asc" }
    });
  }

  async setActive(actor: CurrentUser, userId: string, isActive: boolean) {
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
}
