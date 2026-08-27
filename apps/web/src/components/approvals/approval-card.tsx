/**
 * Human approval cards (issue #9).
 *
 * Renders a pending approval request with fail-closed semantics:
 * - only gateway-supported decisions are offered;
 * - destructive approval never receives default focus;
 * - actions lock after the first accepted response; only a mutation
 *   response may mark resolution;
 * - expired / malformed / resolved requests render as terminal, inert
 *   states with no actionable controls.
 *
 * All decisions go through `useApprovals` (authenticated same-origin
 * proxy + CSRF + one-time idempotency key).
 */
import { useState, type ReactNode } from "react";
import {
  useApprovals,
  type ApprovalDecision,
  type ApprovalDecisionResult,
  type ApprovalRequest,
  type ResolvedApproval,
} from "../../lib/use-approvals";
import { sanitizeToolText } from "./tool-card";

export interface ApprovalCardProps {
  request: ApprovalRequest;
  /**
   * Decision submitter injected from a parent-owned useApprovals hook.
   * When absent the card creates its own hook instance.
   */
  decide?: (approvalId: string, decision: ApprovalDecision) => Promise<ApprovalDecisionResult>;
  /** Id of the approval with an in-flight decision (from the parent hook). */
  pendingId?: string;
}

const DECISION_LABELS: Record<ApprovalDecision, string> = {
  deny: "Deny",
  "approve-once": "Approve once",
  "approve-for-session": "Approve for session",
};

/** Decisions that a reasonable user means when they say "yes". */
const AFFIRMATIVE_DECISIONS: ApprovalDecision[] = ["approve-once", "approve-for-session"];

/**
 * True when the request carries a risk category that must never get default
 * focus on its approval control.
 */
export function isDestructive(request: ApprovalRequest): boolean {
  return request.riskCategory === "destructive";
}

export function isTerminal(request: ApprovalRequest, resolved?: ResolvedApproval): boolean {
  return Boolean(resolved) || request.status !== "pending";
}

export function ApprovalCard(props: ApprovalCardProps): ReactNode {
  const { request, decide: injectedDecide, pendingId: injectedPendingId } = props;
  const own = useApprovals();
  const decide = injectedDecide ?? own.decide;
  const pendingId = injectedPendingId ?? own.pendingId;
  const [resolved, setResolved] = useState<ResolvedApproval | undefined>(undefined);

  const safeExplanation = sanitizeToolText(request.explanation);
  const safeAction = sanitizeToolText(request.action);
  const safePath = request.path !== undefined ? sanitizeToolText(request.path) : undefined;
  const destructive = isDestructive(request);
  const terminal = isTerminal(request, resolved);

  const safeName = sanitizeToolText(request.toolName);
  const label = `Approval: ${safeName}`;

  async function onDecision(decision: ApprovalDecision): Promise<void> {
    const result = await decide(request.id, decision);
    // Only the mutation response may mark resolution; a rejected/stale
    // decision leaves the card as-is (hook already surfaced the error).
    if (result.accepted) {
      setResolved({ id: request.id, decision });
    }
  }

  if (terminal) {
    const decision = resolved?.decision;
    const terminalLabel =
      decision !== undefined
        ? DECISION_LABELS[decision]
        : request.status === "expired"
          ? "Expired"
          : "Resolved";
    return (
      <div
        className="approval-card"
        data-testid={`approval-card-${request.id}`}
        data-resolved="true"
        role="status"
        aria-label={`${label} — ${terminalLabel}`}
      >
        <p data-testid={`approval-terminal-${request.id}`}>{terminalLabel}</p>
        <p data-testid={`approval-explanation-${request.id}`}>{safeExplanation}</p>
      </div>
    );
  }

  const supported = request.supportedDecisions.filter((d) => d in DECISION_LABELS);
  const firstAffirmative = supported.find((d) => AFFIRMATIVE_DECISIONS.includes(d));
  // Safe (non-destructive) focus target: deny first unless the request is
  // destructive, in which case deny is still first — deny is never the
  // dangerous option, so focus always starts on Deny.
  const focusDecision: ApprovalDecision = "deny";

  return (
    <div
      className="approval-card"
      data-testid={`approval-card-${request.id}`}
      data-destructive={destructive ? "true" : "false"}
      aria-label={label}
    >
      <p data-testid={`approval-explanation-${request.id}`}>{safeExplanation}</p>
      <p>
        <span data-testid={`approval-risk-${request.id}`}>{request.riskCategory}</span>
        {" — "}
        <span data-testid={`approval-action-${request.id}`}>{safeAction}</span>
        {safePath ? <span data-testid={`approval-path-${request.id}`}>: {safePath}</span> : null}
      </p>
      <p data-testid={`approval-expires-${request.id}`}>Expires {request.expiresAt}</p>
      <div role="group" aria-label="Approval decisions" data-testid={`approval-actions-${request.id}`}>
        {supported.map((decision) => (
          <button
            key={decision}
            type="button"
            disabled={pendingId !== undefined}
            data-pending={pendingId === request.id ? "true" : "false"}
            data-decision={decision}
            autoFocus={decision === focusDecision}
            onClick={() => void onDecision(decision)}
          >
            {DECISION_LABELS[decision]}
          </button>
        ))}
        {firstAffirmative === undefined && supported.length === 0 ? (
          <p data-testid={`approval-no-decisions-${request.id}`}>No decisions available</p>
        ) : null}
      </div>
    </div>
  );
}
