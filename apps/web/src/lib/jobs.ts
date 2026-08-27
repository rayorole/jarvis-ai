/**
 * Jobs domain: normalize unverified gateway JSON into stable Jarvis types and
 * expose a thin same-origin fetch client for the jobs viewer.
 *
 * Security invariants:
 * - Raw upstream payloads never cross this boundary; UI consumes only these
 *   normalized types.
 * - Delivery targets and script/skill summaries are redacted to safe,
 *   non-executable display strings — credential material is never surfaced.
 * - Unknown states map to "unknown" rather than being guessed.
 */

export type JobState = "queued" | "claimed" | "running" | "paused" | "blocked" | "terminal" | "unknown";

export interface JarvisJob {
  id: string;
  name: string;
  /** Canonical schedule expression (cron etc.) — never reformatted. */
  schedule: string;
  /** Human-readable rendering of the schedule for display. */
  scheduleLabel: string;
  timezone: string;
  enabled: boolean;
  state: JobState;
  nextRunAt: string;
  lastRunAt: string;
  model: string;
  provider: string;
  /** Redacted delivery target description (no secrets). */
  deliveryTarget: string;
  failureStreak: number;
  /** Why the job is blocked, when state is "blocked". */
  blockedReason?: string;
}

export type RunState = "queued" | "claimed" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";

export interface JarvisRun {
  id: string;
  jobId: string;
  state: RunState;
  startedAt: string;
  finishedAt: string;
  /** Redacted output — upstream never sends raw script contents through. */
  output?: string;
  /** Redacted error summary. */
  error?: string;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  /** Redacted delivery result description. */
  deliveryResult: string;
  /** True when the run can be resumed/continued by the user. */
  continuable: boolean;
}

export interface JarvisIncident {
  id: string;
  jobId?: string;
  title: string;
  severity: "info" | "warning" | "critical";
  openedAt: string;
  acknowledged: boolean;
}

/** The four tabs of the jobs viewer. */
export type JobsTab = "jobs" | "runs" | "processes" | "incidents";

export interface BackgroundProcess {
  id: string;
  name: string;
  pid: number;
  state: "running" | "exited" | "unknown";
  startedAt: string;
  /** Safe summary of what the process runs — never the raw script. */
  summary: string;
}

function str(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("upstream payload missing required string field");
  }
  return value;
}

function isoOrEpoch(value: unknown): string {
  if (value === undefined || value === null) return new Date(0).toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 1e12 ? value : value * 1000).toISOString();
  }
  return new Date(0).toISOString();
}

/** Redact anything that looks like a secret or raw script from free text. */
export function redactSummary(value: unknown, maxLen = 120): string {
  if (typeof value !== "string") return "";
  const redacted = value
    .replace(/\b(?:sk|ghp|gho|github_pat|xoxb|xoxp)\S+/gi, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "[redacted]")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[redacted]")
    .replace(/(?:password|token|secret|credential|api[_-]?key)\s*[:=]\s*\S+/gi, "$1: [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > maxLen ? `${redacted.slice(0, maxLen - 1)}…` : redacted;
}

export function normalizeJobState(value: unknown): JobState {
  return value === "queued" || value === "claimed" || value === "running" || value === "paused" || value === "blocked" || value === "terminal"
    ? value
    : "unknown";
}

export function normalizeJob(raw: unknown): JarvisJob {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("upstream job payload is not an object");
  }
  const r = raw as Record<string, unknown>;
  const state = normalizeJobState(r.state);
  return {
    id: str(r.id),
    name: typeof r.name === "string" ? r.name : "",
    /** Canonical expression is preserved verbatim. */
    schedule: typeof r.schedule === "string" ? r.schedule : "",
    scheduleLabel: typeof r.scheduleLabel === "string" ? r.scheduleLabel : typeof r.schedule === "string" ? r.schedule : "",
    timezone: typeof r.timezone === "string" ? r.timezone : "UTC",
    enabled: r.enabled !== false,
    state,
    nextRunAt: isoOrEpoch(r.nextRunAt),
    lastRunAt: isoOrEpoch(r.lastRunAt),
    model: typeof r.model === "string" ? r.model : "unknown",
    provider: typeof r.provider === "string" ? r.provider : "unknown",
    deliveryTarget: redactSummary(r.deliveryTarget),
    failureStreak: typeof r.failureStreak === "number" && Number.isFinite(r.failureStreak) ? Math.max(0, Math.trunc(r.failureStreak)) : 0,
    blockedReason: state === "blocked" ? redactSummary(r.blockedReason) : undefined,
  };
}

export function normalizeRunState(value: unknown): RunState {
  return value === "queued" || value === "claimed" || value === "running" || value === "succeeded" || value === "failed" || value === "cancelled"
    ? value
    : "unknown";
}

export function normalizeRun(raw: unknown): JarvisRun {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("upstream run payload is not an object");
  }
  const r = raw as Record<string, unknown>;
  const usage = (typeof r.usage === "object" && r.usage !== null ? r.usage : {}) as Record<string, unknown>;
  return {
    id: str(r.id),
    jobId: typeof r.jobId === "string" ? r.jobId : "",
    state: normalizeRunState(r.state),
    startedAt: isoOrEpoch(r.startedAt),
    finishedAt: isoOrEpoch(r.finishedAt),
    output: typeof r.output === "string" ? redactSummary(r.output, 400) : undefined,
    error: typeof r.error === "string" ? redactSummary(r.error, 400) : undefined,
    usage: {
      inputTokens: typeof r.usage !== "object" || r.usage === null ? 0 : num((r.usage as Record<string, unknown>).inputTokens),
      outputTokens: typeof r.usage !== "object" || r.usage === null ? 0 : num((r.usage as Record<string, unknown>).outputTokens),
    },
    costUsd: typeof r.costUsd === "number" && Number.isFinite(r.costUsd) ? Math.max(0, r.costUsd) : 0,
    deliveryResult: redactSummary(r.deliveryResult),
    continuable: r.continuable === true,
  };
}

export function normalizeIncident(raw: unknown): JarvisIncident {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("upstream incident payload is not an object");
  }
  const r = raw as Record<string, unknown>;
  return {
    id: str(r.id),
    jobId: typeof r.jobId === "string" ? r.jobId : undefined,
    title: typeof r.title === "string" ? r.title : "",
    severity: r.severity === "warning" || r.severity === "critical" || r.severity === "info" ? r.severity : "info",
    openedAt: isoOrEpoch(r.openedAt),
    acknowledged: r.acknowledged === true,
  };
}

export function normalizeProcess(raw: unknown): BackgroundProcess {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("upstream process payload is not an object");
  }
  const r = raw as Record<string, unknown>;
  return {
    id: str(r.id),
    name: typeof r.name === "string" ? r.name : "",
    pid: typeof r.pid === "number" && Number.isFinite(r.pid) ? Math.trunc(r.pid) : 0,
    state: r.state === "running" || r.state === "exited" ? r.state : "unknown",
    startedAt: isoOrEpoch(r.startedAt),
    summary: redactSummary(r.summary ?? r.script),
  };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/** Format a canonical schedule + timezone into a human-readable label. */
export function formatSchedule(schedule: string, timezone: string): string {
  const tz = timezone || "UTC";
  if (!schedule) return `unscheduled (${tz})`;
  return `${schedule} (${tz})`;
}