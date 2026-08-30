import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button as ShadButton } from "@/components/ui/button";
import { Badge as ShadBadge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export type StatusState =
  | "online"
  | "degraded"
  | "offline"
  | "unknown"
  | "neutral"
  | "success"
  | "warning"
  | "danger";

export interface StatusDotProps {
  state: StatusState;
  /** Visible text label — status is never conveyed by color alone. */
  label?: string;
  className?: string;
}

const STATE_BADGE_VARIANT: Record<
  StatusState,
  "default" | "secondary" | "destructive" | "outline"
> = {
  online: "default",
  success: "default",
  degraded: "secondary",
  warning: "secondary",
  offline: "destructive",
  danger: "destructive",
  unknown: "outline",
  neutral: "outline",
};

/**
 * Status indicator built on shadcn Badge. The dot is decorative;
 * the label carries the information for screen readers and colorblind users.
 */
export function StatusDot({ state, label, className }: StatusDotProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs", className)}
      data-state={state}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-2 rounded-full",
          state === "online" || state === "success"
            ? "bg-emerald-400"
            : state === "degraded" || state === "warning"
              ? "bg-amber-400"
              : state === "offline" || state === "danger"
                ? "bg-red-400"
                : "bg-muted-foreground/50",
        )}
      />
      <ShadBadge variant={STATE_BADGE_VARIANT[state] ?? "outline"}>{label ?? state}</ShadBadge>
    </span>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

/** A button that always exposes an accessible name. */
export function IconButton({ label, children, className, ...rest }: IconButtonProps) {
  return (
    <ShadButton type="button" aria-label={label} title={label} className={className} {...rest}>
      {children}
    </ShadButton>
  );
}

export interface PanelProps {
  surface?: "canvas" | "panel" | "raised";
  children: ReactNode;
  className?: string;
}

/** Card wrapper on the shadcn Card primitive. */
export function Panel({ surface, children, className }: PanelProps) {
  return (
    <Card data-surface={surface} className={cn("py-4", className)}>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
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
 * Route-level loading / error / empty / offline / not-found pattern built on
 * shadcn Skeleton / Empty / Alert primitives. Errors name the failed operation
 * and preserve retry; offline preserves read-only context.
 */
export function StatePattern({ kind, title, detail, retry, lastChecked, children }: StatePatternProps) {
  if (kind === "loading") {
    return (
      <section aria-busy="true" data-testid="state-loading" className="space-y-2">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </section>
    );
  }
  if (kind === "empty" || kind === "not-found") {
    return (
      <section data-testid={`state-${kind}`}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">◌</EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            {detail ? <EmptyDescription>{detail}</EmptyDescription> : null}
          </EmptyHeader>
          {retry ? (
            <ShadButton variant="outline" onClick={retry}>
              Retry
            </ShadButton>
          ) : null}
          {children}
        </Empty>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="state-error-title"
      data-testid={`state-${kind}`}
      role="alert"
      className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <h2 id="state-error-title" className="font-medium">
        {title}
      </h2>
      {detail ? <p className="text-muted-foreground">{detail}</p> : null}
      {kind === "offline" && lastChecked ? (
        <p className="text-muted-foreground">Last successful check: {lastChecked}</p>
      ) : null}
      {retry ? (
        <ShadButton variant="outline" size="sm" onClick={retry} className="mt-2">
          Retry
        </ShadButton>
      ) : null}
      {children}
    </section>
  );
}
