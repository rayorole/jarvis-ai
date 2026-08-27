/**
 * Typed client for the Jarvis approvals API (`/api/approvals*`).
 *
 * Decisions are POSTed through the authenticated same-origin proxy with a
 * CSRF token and a one-time idempotency key per decision attempt. Thin
 * fetch layer; no state lives here.
 */

export type ApprovalDecision = "deny" | "approve-once" | "approve-for-session";

export type ApprovalRiskCategory = "safe" | "elevated" | "destructive";

export type ApprovalStatus = "pending" | "expired" | "resolved";

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  runId: string;
  toolName: string;
  /** Human explanation of what the tool wants to do. */
  explanation: string;
  riskCategory: ApprovalRiskCategory;
  /** Sanitized action description, e.g. "write file". */
  action: string;
  /** Sanitized path/argument the action targets, when applicable. */
  path?: string;
  /** ISO timestamp after which the request fails closed. */
  expiresAt: string;
  status: ApprovalStatus;
  /** Only decisions the gateway explicitly supports for this request. */
  supportedDecisions: ApprovalDecision[];
}

export interface ApprovalDecisionResult {
  accepted: boolean;
  reason?: string;
}

/** Read the CSRF token injected by the app shell into the document. */
export function readCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.querySelector('meta[name="csrf-token"]');
  const value = el?.getAttribute("content") ?? undefined;
  return value !== undefined && value.length > 0 ? value : undefined;
}

function generateIdempotencyKey(): string {
  // One-time key per decision attempt; crypto.getRandomValues preferred.
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class ApprovalsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: unknown,
  ) {
    super(`approvals API error ${status}`);
    this.name = "ApprovalsApiError";
  }
}

export type ApprovalsFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Validate a server payload shape-wise; malformed payloads return null. */
function parseApprovalRequest(value: unknown): ApprovalRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string") return null;
  if (typeof v.toolName !== "string") return null;
  if (typeof v.explanation !== "string") return null;
  if (typeof v.action !== "string") return null;
  if (typeof v.expiresAt !== "string") return null;
  const risk = v.riskCategory;
  if (risk !== "safe" && risk !== "elevated" && risk !== "destructive") return null;
  const status = v.status;
  if (status !== "pending" && status !== "expired" && status !== "resolved") return null;
  const supported = v.supportedDecisions;
  if (!Array.isArray(supported)) return null;
  const decisions = supported.filter(
    (d): d is ApprovalDecision => d === "deny" || d === "approve-once" || d === "approve-for-session",
  );
  return {
    id: v.id,
    sessionId: typeof v.sessionId === "string" ? v.sessionId : "",
    runId: typeof v.runId === "string" ? v.runId : "",
    toolName: v.toolName,
    explanation: v.explanation,
    riskCategory: risk,
    action: v.action,
    path: typeof v.path === "string" ? v.path : undefined,
    expiresAt: v.expiresAt,
    status,
    supportedDecisions: decisions,
  };
}

export async function fetchPendingApprovals(fetchImpl: ApprovalsFetch = fetch): Promise<ApprovalRequest[]> {
  const res = await fetchImpl("/api/approvals", { method: "GET", headers: { accept: "application/json" } });
  if (!res.ok) throw new ApprovalsApiError(res.status, null);
  const body: unknown = await res.json();
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.map(parseApprovalRequest).filter((r): r is ApprovalRequest => r !== null);
}

export async function decideApproval(
  approvalId: string,
  decision: ApprovalDecision,
  fetchImpl: ApprovalsFetch = fetch,
): Promise<ApprovalDecisionResult> {
  const csrf = readCsrfToken();
  const res = await fetchImpl(`/api/approvals/${encodeURIComponent(approvalId)}/decision`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrf ?? "",
      "x-idempotency-key": generateIdempotencyKey(),
    },
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) {
    throw new ApprovalsApiError(res.status, await res.json().catch(() => null));
  }
  const body: unknown = await res.json();
  const accepted = (body as { accepted?: unknown }).accepted === true;
  const reason = (body as { reason?: unknown }).reason;
  return { accepted, reason: typeof reason === "string" ? reason : undefined };
}
