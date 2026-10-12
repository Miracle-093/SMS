import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppNotice, authenticatedHeaders, errorForResponse, restoreStoredSession, serializeStoredSession, shouldClearSession, toUserFacingError } from "./ui.js";

const storedSession = {
  accessToken: "test-token",
  user: { id: "user-1", schoolId: "school-1", displayName: "Test User", email: "test@example.invalid", roles: ["ADMIN"], permissions: [], mustChangePassword: false }
};

describe("Desktop session policy", () => {
  it("persists a successful login for the next application initialization", () => {
    expect(restoreStoredSession<typeof storedSession>(serializeStoredSession(storedSession))).toEqual(storedSession);
  });

  it("restores a valid authenticated session after a refresh", () => {
    expect(restoreStoredSession<typeof storedSession>(serializeStoredSession(storedSession))?.accessToken).toBe("test-token");
  });

  it("attaches the stored token to protected bootstrap requests", () => {
    expect(authenticatedHeaders(storedSession.accessToken).Authorization).toBe("Bearer test-token");
  });

  it("retains the session for a 403 permission denial", () => {
    expect(shouldClearSession(errorForResponse(403, "sensitive details"))).toBe(false);
  });

  it("retains the session for network and other recoverable failures", () => {
    expect(shouldClearSession(errorForResponse(404, "sensitive details"))).toBe(false);
    expect(shouldClearSession(errorForResponse(409, "sensitive details"))).toBe(false);
    expect(shouldClearSession(errorForResponse(503, "sensitive details"))).toBe(false);
    expect(shouldClearSession(new TypeError("network failure"))).toBe(false);
  });

  it("clears the session only for a genuine authentication failure", () => {
    expect(shouldClearSession(errorForResponse(401, "sensitive details"))).toBe(true);
  });

  it("never renders technical API details in a user-facing notice", () => {
    const error = errorForResponse(503, "database connection text that must remain private");
    const html = renderToStaticMarkup(<AppNotice error={toUserFacingError(error)} />);
    expect(html).toContain("Please try again.");
    expect(html).not.toContain(error.details);
  });
});
