import React from "react";

export type UserFacingError = {
  message: string;
  details?: string;
};

export class AppRequestError extends Error {
  readonly status: number;
  readonly details: string;

  constructor(status: number, message: string, details: string) {
    super(message);
    this.name = "AppRequestError";
    this.status = status;
    this.details = details;
  }
}

export function errorForResponse(status: number, details: string): AppRequestError {
  if (status === 401) {
    return new AppRequestError(status, "Your session has expired. Please sign in again.", details);
  }
  if (status === 403) {
    return new AppRequestError(status, "You do not have permission to access this section.", details);
  }
  if (status >= 500) {
    return new AppRequestError(status, "The server could not complete this request. Please try again.", details);
  }
  return new AppRequestError(status, "We could not complete that request. Please review the form and try again.", details);
}

export function toUserFacingError(error: unknown, fallback = "Something went wrong. Please try again."): UserFacingError {
  if (error instanceof AppRequestError) {
    return { message: error.message, details: error.details };
  }
  if (error instanceof Error) {
    return { message: error.message || fallback };
  }
  return { message: fallback };
}

export function userMessage(error: unknown, fallback?: string) {
  return toUserFacingError(error, fallback).message;
}

export function AppNotice({ error, message }: { error?: UserFacingError | null; message?: string }) {
  const display = error ?? (message ? { message } : null);
  if (!display) return null;
  return (
    <div className="notice app-notice" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} aria-atomic="true">
      <span>{display.message}</span>
      {display.details && (
        <details>
          <summary>Technical details</summary>
          <pre>{display.details}</pre>
        </details>
      )}
    </div>
  );
}

export function PermissionDeniedState({ sectionName }: { sectionName?: string }) {
  return (
    <section className="permission-denied" role="alert">
      <p className="eyebrow">Restricted section</p>
      <h3>{sectionName ?? "Access restricted"}</h3>
      <p>You do not have permission to access this section.</p>
    </section>
  );
}

export function UserIdentity({
  displayName,
  roles,
  workspace,
  school,
  scope
}: {
  displayName: string;
  roles: string[];
  workspace: string;
  school: string;
  scope?: string | null;
}) {
  const roleText = roles.length ? roles.map(formatRoleLabel).join(", ") : "Role pending";
  return (
    <div className="user-identity" aria-label="Signed-in user">
      <strong>{displayName}</strong>
      <span>{roleText}</span>
      <span>{workspace} - {school}</span>
      {scope && <span>{scope}</span>}
    </div>
  );
}

function formatRoleLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
