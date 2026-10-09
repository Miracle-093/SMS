import { describe, expect, it } from "vitest";
import { sanitizeLoginResponse } from "../scripts/sanitize-login-response.js";

describe("sanitizeLoginResponse", () => {
  it("reports the login contract without sensitive values", () => {
    const result = sanitizeLoginResponse(201, { accessToken: "do-not-report", refreshToken: "do-not-report", passwordHash: "do-not-report", user: { roles: ["Head Teacher"], schoolId: "school", mustChangePassword: false }, nested: { token: "do-not-report" } });
    expect(result).toEqual({ status: 201, fields: ["nested", "user"], role: "Head Teacher", schoolContextPresent: true, mustChangePassword: false, accessTokenPresent: true, errorCode: null, message: null });
    expect(JSON.stringify(result)).not.toContain("do-not-report");
  });
});
