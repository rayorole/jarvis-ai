import type { ButtonHTMLAttributes, ReactNode } from "react";

export type StatusState = "online" | "degraded" | "offline" | "unknown" | "neutral" | "success" | "warning" | "danger";

export interface StatusDotProps {
  state: StatusState;
  /** Visible text label — status is never conveyed by color alone. */
  label?: string;
  className?: string;
}

/**
 * Colored dot paired with a mandatory text label. The dot is decorative;
 * the label carries the information for screen readers and colorblind users.
 */
export function StatusDot({ state, label, className }: StatusDotProps) {
  return (
    <span
      className={className}
      data-state={state}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", fontSize: "var(--text-metadata)" }}
    >
      <span aria-hidden="true" style={{ color: `var(--status-${toToken(state)})`, fontSize: "0.625rem" }}>
        {shapeFor(state)}
      </span>
      <span>{label ?? state}</span>
    </span>
  );
}

function toToken(state: string): string {
  switch (state) {
    case "online":
    case "success":
      return "success";
    case "degraded":
    case "warning":
      return "warning";
    case "offline":
    case "unknown":
    case "danger":
      return "danger";
    default:
      return "neutral";
  }
}

function shapeFor(state: string): string {
  switch (state) {
    case "online":
    case "success":
      return "\u25CF"; // filled circle
    case "degraded":
    case "warning":
      return "\u25B2"; // triangle
    case "offline":
    case "unknown":
    case "danger":
      return "\u25A0"; // square
    default:
      return "\u25CB"; // empty circle
  }
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

/** A button that always exposes an accessible name. */
export function IconButton({ label, children, ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

export interface PanelProps {
  surface?: "canvas" | "panel" | "raised";
  children: ReactNode;
  className?: string;
}

export function Panel({ surface = "panel", children, className }: PanelProps) {
  return (
    <div className={className} data-surface={surface} style={{ background: `var(--surface-${surface})` }}>
      {children}
    </div>
  );
}

export interface StatePatternProps {
  kind: "loading" | "error" | "empty" | "offline" | "not-found";
  title: string;
  detail?: string;
  retry?: () => void;
  lastChecked?: string;
  children?: ReactNode;
}

/**
 * Route-level loading / error / empty / offline / not-found pattern,
 * reusable by every Jarvis module. Errors name the failed operation and
 * preserve retry; offline preserves read-only context.
 */
export function StatePattern({ kind, title, detail, retry, lastChecked, children }: StatePatternProps) {
  const id = `state-${kind}`;
  return (
    <section aria-labelledby={id} data-testid={`state-${kind}`} className={`state-pattern state-pattern--${kind}`}>
      <h2 id={id} className="state-pattern__title">
        {title}
      </h2>
      {detail ? <p>{detail}</p> : null}
      {kind === "offline" && lastChecked ? <p>Last successful check: {lastChecked}</p> : null}
      {retry ? (
        <button type="button" onClick={retry}>
          Retry
        </button>
      ) : null}
      {children}
    </section>
  );
}
