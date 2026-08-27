/**
 * Tool card component (issue #9).
 *
 * Compact expandable card that renders sanitized tool lifecycle information
 * for a single tool call. The card is purely presentational: it renders the
 * lifecycle state it is given and never executes anything client-side.
 */
import { useState, type ReactNode } from "react";

export type ToolCardState = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ToolCardProps {
  toolCallId: string;
  toolName: string;
  /** Pre-sanitized intent/arguments summary line. */
  args?: string;
  state: ToolCardState;
  /** Elapsed time label, e.g. "12s"; computed upstream so time is injectable. */
  elapsedLabel?: string;
  /** Bounded output preview (already truncated/sanitized upstream). */
  outputPreview?: string;
  /** Artifact names/paths to list (already sanitized upstream). */
  artifacts?: string[];
  /** Optional log drawer slot (id of an element opened via a toggle). */
  logDrawer?: ReactNode;
}

const STATE_LABELS: Record<ToolCardState, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/**
 * Render text as inert text (React escapes it); strip anything that could
 * smuggle markup through unusual channels (e.g. null bytes, control chars).
 */
export function sanitizeToolText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

export function ToolCard({
  toolCallId,
  toolName,
  args,
  state,
  elapsedLabel,
  outputPreview,
  artifacts,
  logDrawer,
}: ToolCardProps): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const safeName = sanitizeToolText(toolName);
  const safeArgs = args !== undefined ? sanitizeToolText(args) : undefined;
  const safeOutput = outputPreview !== undefined ? sanitizeToolText(outputPreview) : undefined;
  const safeArtifacts = (artifacts ?? []).map(sanitizeToolText);

  return (
    <div
      className="tool-card"
      data-testid={`tool-card-${toolCallId}`}
      data-state={state}
      role="group"
      aria-label={`Tool ${safeName}: ${STATE_LABELS[state]}`}
    >
      <div className="tool-card-summary">
        <span data-testid={`tool-state-${toolCallId}`} data-state={state}>
          {STATE_LABELS[state]}
        </span>
        <span data-testid={`tool-name-${toolCallId}`}>{safeName}</span>
        {safeArgs !== undefined ? <span data-testid={`tool-args-${toolCallId}`}>{safeArgs}</span> : null}
        {elapsedLabel ? <span data-testid={`tool-elapsed-${toolCallId}`}>{sanitizeToolText(elapsedLabel)}</span> : null}
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`Toggle tool ${safeName} details`}
          data-testid={`tool-expand-${toolCallId}`}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide details" : "Show details"}
        </button>
      </div>
      {expanded ? (
        <div className="tool-card-details" data-testid={`tool-details-${toolCallId}`}>
          {safeOutput ? (
            <pre data-testid={`tool-output-${toolCallId}`}>{safeOutput}</pre>
          ) : (
            <p data-testid={`tool-output-empty-${toolCallId}`}>No output</p>
          )}
          {safeArtifacts.length > 0 ? (
            <ul data-testid={`tool-artifacts-${toolCallId}`}>
              {safeArtifacts.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
          {logDrawer}
        </div>
      ) : null}
    </div>
  );
}
