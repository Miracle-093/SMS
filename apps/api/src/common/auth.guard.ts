import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { TokenService } from "../auth/token.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const header = request.headers.authorization ?? request.headers.Authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) {
      return false;
    }
    request.user = this.tokenService.verify(token);
    return true;
  }
}
