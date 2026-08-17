import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { CurrentUser } from "@aethina/shared-types";

@Injectable()
export class TokenService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  sign(user: CurrentUser): string {
    const header = this.encode({ alg: "HS256", typ: "JWT" });
    const payload = this.encode({ ...user, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 });
    return `${header}.${payload}.${this.signature(`${header}.${payload}`)}`;
  }

  verify(token: string): CurrentUser {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) {
      throw new UnauthorizedException("Invalid token.");
    }
    const expected = this.signature(`${header}.${payload}`);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new UnauthorizedException("Invalid token signature.");
    }
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CurrentUser & { exp: number };
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("Token expired.");
    }
    return decoded;
  }

  private encode(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
  }

  private signature(value: string): string {
    const secret = this.config.get<string>("JWT_SECRET") ?? "development-only";
    return createHmac("sha256", secret).update(value).digest("base64url");
  }
}
