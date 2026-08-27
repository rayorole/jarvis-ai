/**
 * Usage ticker: compact always-visible readout of cumulative token usage and
 * cost, with a live/stale indicator driven by the polling lifecycle.
 */
import { Panel } from "@jarvis/ui";
import { formatInt, formatUsd } from "@/components/usage/format";

export interface UsageTickerProps {
  totals: { inputTokens: number; outputTokens: number; costUsd: number };
  /** False while polling is paused (hidden tab / offline) or the data is stale. */
  live: boolean;
}

export function UsageTicker({ totals, live }: UsageTickerProps) {
  return (
    <div data-testid="usage-ticker" role="status" aria-live="polite" aria-label="Usage and cost summary">
      <Panel>
        <h2>Usage</h2>
        <dl>
          <dt>Input tokens</dt>
          <dd data-testid="ticker-input-tokens">{formatInt(totals.inputTokens)}</dd>
          <dt>Output tokens</dt>
          <dd data-testid="ticker-output-tokens">{formatInt(totals.outputTokens)}</dd>
          <dt>Estimated cost</dt>
          <dd data-testid="ticker-cost">{formatUsd(totals.costUsd)}</dd>
        </dl>
        <p>
          <span data-testid="ticker-live">{live ? "live" : "stale"}</span>
          <span className="sr-only">{live ? "Usage data is current" : "Usage data may be out of date"}</span>
        </p>
      </Panel>
    </div>
  );
}
