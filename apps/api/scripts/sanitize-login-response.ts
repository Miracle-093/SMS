export type SanitizedLoginResponse = {
  status: number;
  fields: string[];
  role: string | null;
  schoolContextPresent: boolean;
  mustChangePassword: boolean | null;
  accessTokenPresent: boolean;
  errorCode: number | null;
  message: string | null;
};

const sensitive = /token|password|pin|hash|secret|credential/i;

export function sanitizeLoginResponse(status: number, body: unknown): SanitizedLoginResponse {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const user = value.user && typeof value.user === "object" ? value.user as Record<string, unknown> : {};
  return {
    status,
    fields: Object.keys(value).filter((key) => !sensitive.test(key)).sort(),
    role: Array.isArray(user.roles) && typeof user.roles[0] === "string" ? user.roles[0] : null,
    schoolContextPresent: typeof user.schoolId === "string" && user.schoolId.length > 0,
    mustChangePassword: typeof user.mustChangePassword === "boolean" ? user.mustChangePassword : null,
    accessTokenPresent: typeof value.accessToken === "string" && value.accessToken.length > 0,
    errorCode: typeof value.statusCode === "number" ? value.statusCode : null,
    message: typeof value.message === "string" ? value.message : null
  };
}
