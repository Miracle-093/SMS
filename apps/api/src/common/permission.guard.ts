import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRED_PERMISSIONS_KEY } from "./permissions.decorator.js";
import type { CurrentUser } from "@aethina/shared-types";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]) ?? [];
    if (required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user?: CurrentUser }>();
    const permissions = new Set(request.user?.permissions ?? []);
    return required.every((permission) => permissions.has(permission));
  }
}
