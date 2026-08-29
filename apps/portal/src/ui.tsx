import React from "react";

export type PortalIssue = {
  message: string;
  details?: string;
};

export function AlertMessage({ issue, title = "We could not complete that request" }: { issue?: PortalIssue | null; title?: string }) {
  if (!issue) return null;
  return (
    <section className="alert-message" role="alert">
      <strong>{title}</strong>
      <p>{issue.message}</p>
      {issue.details && (
        <details>
          <summary>Technical details</summary>
          <pre>{issue.details}</pre>
        </details>
      )}
    </section>
  );
}

export function LoadingState({ title, helper = "Please wait while the portal loads the latest school information." }: { title: string; helper?: string }) {
  return (
    <section className="state-panel skeleton" aria-live="polite">
      <div>
        <p className="eyebrow">Loading</p>
        <h2>{title}</h2>
        <p>{helper}</p>
      </div>
      <span />
      <span />
      <span />
    </section>
  );
}

export function EmptyState({ title = "Nothing to show yet", helper = "When the school publishes information, it will appear here." }: { title?: string; helper?: string }) {
  return (
    <section className="state-panel empty-state">
      <p className="eyebrow">No records</p>
      <h3>{title}</h3>
      <p>{helper}</p>
    </section>
  );
}

export function LoadFailed({ title, issue, onRetry }: { title: string; issue?: PortalIssue | null; onRetry: () => void }) {
  return (
    <section className="state-panel load-failed">
      <p className="eyebrow">Connection</p>
      <h2>{title}</h2>
      <p>{issue?.message ?? "The portal could not load this section. Check the connection and try again."}</p>
      {issue?.details && (
        <details>
          <summary>Technical details</summary>
          <pre>{issue.details}</pre>
        </details>
      )}
      <button type="button" onClick={onRetry}>Retry</button>
    </section>
  );
}
