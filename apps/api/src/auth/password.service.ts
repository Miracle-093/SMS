import { Injectable } from "@nestjs/common";
import { randomBytes, timingSafeEqual, pbkdf2Sync } from "node:crypto";

const iterations = 210_000;
const keyLength = 32;
const digest = "sha256";

@Injectable()
export class PasswordService {
  hash(secret: string): string {
    const salt = randomBytes(16).toString("base64url");
    const hash = pbkdf2Sync(secret, salt, iterations, keyLength, digest).toString("base64url");
    return `pbkdf2$${iterations}$${salt}$${hash}`;
  }

  verify(secret: string, storedHash: string): boolean {
    if (storedHash.startsWith("dev:")) {
      return storedHash === `dev:${secret}`;
    }
    const [algorithm, iterationText, salt, expected] = storedHash.split("$");
    if (algorithm !== "pbkdf2" || !iterationText || !salt || !expected) {
      return false;
    }
    const actual = pbkdf2Sync(secret, salt, Number(iterationText), keyLength, digest);
    const expectedBuffer = Buffer.from(expected, "base64url");
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  }

  temporaryPassword(): string {
    return `Ae-${randomBytes(9).toString("base64url")}9`;
  }
}
