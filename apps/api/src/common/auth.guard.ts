import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CurrentUser } from "@aethina/shared-types";
import { TokenService } from "../auth/token.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const header = request.headers.authorization ?? request.headers.Authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) {
      return false;
    }
    const tokenUser = this.tokenService.verify(token);
    request.user = tokenUser.roles.includes("PORTAL_USER") ? tokenUser : await this.currentStaffUser(tokenUser);
    return true;
  }

  private async currentStaffUser(tokenUser: CurrentUser): Promise<CurrentUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: tokenUser.id, schoolId: tokenUser.schoolId },
      select: {
        id: true,
        schoolId: true,
        email: true,
        displayName: true,
        isActive: true,
        mustChangePassword: true,
        roles: { select: { role: { select: { name: true, permissions: { select: { permission: { select: { key: true } } } } } } } }
      }
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Your session is no longer active. Please sign in again.");
    }
    return {
      id: user.id,
      schoolId: user.schoolId,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles.map((item) => item.role.name),
      permissions: Array.from(new Set(user.roles.flatMap((item) => item.role.permissions.map((permission) => permission.permission.key)))),
      mustChangePassword: user.mustChangePassword
    };
  }
}
