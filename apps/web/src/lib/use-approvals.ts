/**
 * Pending-approvals hook (issue #9).
 *
 * Polls the authenticated same-origin proxy for pending approvals and sends
 * decisions with a one-time idempotency key. The hook owns lock-after-accept:
 * once a decision response arrives (accepted or explicitly rejected), the
 * caller cannot submit another decision for the same approval from this hook
 * until the response has been consumed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  decideApproval,
  fetchPendingApprovals,
  type ApprovalDecision,
  type ApprovalDecisionResult,
  type ApprovalRequest,
} from "./approvals-api";

export type { ApprovalDecision, ApprovalDecisionResult, ApprovalRequest } from "./approvals-api";

export interface ResolvedApproval {
  id: string;
  decision: ApprovalDecision;
}

export interface UseApprovalsResult {
  pending: ApprovalRequest[];
  isLoading: boolean;
  error: Error | undefined;
  /** Id of the approval with an in-flight decision, if any. */
  pendingId: string | undefined;
  /**
   * Submit a decision for an approval. Resolves with the server verdict;
   * `accepted: false` means the gateway rejected it (stale, expired,
   * duplicate, cross-session, malformed) and the card must stay un-resolved.
   */
  decide: (approvalId: string, decision: ApprovalDecision) => Promise<ApprovalDecisionResult>;
  refresh: () => void;
}

export function useApprovals(
  fetchImpl: typeof fetch = fetch,
  options: { pollMs?: number } = {},
): UseApprovalsResult {
  const pollMs = options.pollMs ?? 0; // 0 = no polling (tests / on-demand refresh)
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [pendingId, setPendingId] = useState<string | undefined>(undefined);
  const locked = useRef(new Set<string>());
  const fetchRef = useRef(fetchImpl);
  fetchRef.current = fetchImpl;

  const refresh = useCallback(() => {
    setIsLoading(true);
    fetchRef
      .current("/api/approvals", { method: "GET", headers: { accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`approvals refresh failed: ${res.status}`);
        const body: unknown = await res.json();
        const items = (body as { items?: unknown }).items;
        const list = Array.isArray(items) ? (items as ApprovalRequest[]) : [];
        setPending(list.filter((r) => r && typeof r.id === "string"));
        setError(undefined);
      })
      .catch((err: unknown) => {
        // Fail closed: keep last-known list but surface the error.
        setError(err instanceof Error ? err : new Error("approvals refresh failed"));
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    if (pollMs <= 0) return;
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  const decide = useCallback(async (approvalId: string, decision: ApprovalDecision): Promise<ApprovalDecisionResult> => {
    if (locked.current.has(approvalId)) {
      return { accepted: false, reason: "duplicate" };
    }
    locked.current.add(approvalId);
    setPendingId(approvalId);
    try {
      const result = await decideApproval(approvalId, decision, fetchRef.current);
      if (result.accepted) {
        // Server accepted: drop the request from the pending list.
        setPending((prev) => prev.filter((r) => r.id !== approvalId));
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error("approval decision failed"));
      // Network/HTTP failure fails closed: not accepted, card stays pending.
      return { accepted: false, reason: "error" };
    } finally {
      setPendingId(undefined);
    }
  }, []);

  return { pending, isLoading, error, pendingId, decide, refresh };
}
