/**
 * Usage and cost domain: normalize unverified gateway usage JSON into stable
 * Jarvis types for the usage/cost dashboards (issue #14 scope).
 *
 * Security invariants:
 * - Raw upstream payloads never cross this boundary; UI consumes only these
 *   normalized types.
 * - Unknown states map to "unknown"/empty rather than being guessed.
 * - No credential or secret material is represented in this shape.
 */

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface UsageSession {
  id: string;
  label: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  messages: number;
}

export interface UsageSnapshot {
  /** ISO timestamp reported by upstream; empty when absent. */
  generatedAt: string;
  totals: UsageTotals;
  sessions: UsageSession[];
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeSession(raw: unknown): UsageSession {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const usage = (typeof r.usage === "object" && r.usage !== null ? r.usage : {}) as Record<string, unknown>;
  return {
    id: str(r.id),
    label: str(r.label),
    inputTokens: num(r.inputTokens ?? usage.inputTokens),
    outputTokens: num(r.outputTokens ?? usage.outputTokens),
    costUsd: num(r.costUsd ?? usage.costUsd),
    messages: num(r.messages),
  };
}

export function normalizeUsageSnapshot(raw: unknown): UsageSnapshot {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const t = (typeof r.totals === "object" && r.totals !== null ? r.totals : {}) as Record<string, unknown>;
  const sessions = Array.isArray(r.sessions) ? r.sessions : [];
  return {
    generatedAt: str(r.generatedAt),
    totals: {
      inputTokens: num(t.inputTokens),
      outputTokens: num(t.outputTokens),
      costUsd: num(t.costUsd),
    },
    sessions: sessions.map(normalizeSession),
  };
}
