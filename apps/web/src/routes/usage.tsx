import { createFileRoute } from "@tanstack/react-router";
import { StatePattern, Panel } from "@jarvis/ui";
import { useUsage, USAGE_POLL_INTERVAL_MS } from "@/hooks/useUsage";
import { UsageTicker } from "@/components/usage/usage-ticker";
import { formatUsd } from "@/components/usage/format";

export const Route = createFileRoute("/usage")({
  component: UsageRoute,
});

function UsageRoute() {
  const { data, isPending, isError, error, refetch, isLive } = useUsage();

  if (isPending) return <StatePattern kind="loading" title="Loading usage" />;
  if (isError)
    return (
      <StatePattern
        kind="error"
        title="Could not load usage"
        detail={error instanceof Error ? error.message : undefined}
        retry={() => void refetch()}
      />
    );

  const sessions = data.sessions;
  if (sessions.length === 0) {
    return (
      <section aria-labelledby="usage-title">
        <h1 id="usage-title">Usage &amp; Cost</h1>
        <UsageTicker totals={data.totals} live={isLive} />
        <StatePattern
          kind="empty"
          title="No usage recorded yet"
          detail="Token and cost usage appears here once sessions report activity."
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="usage-title">
      <h1 id="usage-title">Usage &amp; Cost</h1>
      <UsageTicker totals={data.totals} live={isLive} />
      <button type="button" onClick={() => void refetch()} data-testid="usage-refresh">
        Refresh
      </button>
      <p data-testid="usage-poll-interval">Auto-refreshes every {Math.round(USAGE_POLL_INTERVAL_MS / 1000)}s.</p>
      <Panel>
        <h2>Per-session usage</h2>
        <table>
          <caption>Sessions by token usage and cost</caption>
          <thead>
            <tr>
              <th scope="col">Session</th>
              <th scope="col">Messages</th>
              <th scope="col">Input tokens</th>
              <th scope="col">Output tokens</th>
              <th scope="col">Cost</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} data-testid={`session-${s.id}`}>
                <th scope="row">{s.label || s.id}</th>
                <td>{s.messages}</td>
                <td>{new Intl.NumberFormat("en-US").format(s.inputTokens)}</td>
                <td>{new Intl.NumberFormat("en-US").format(s.outputTokens)}</td>
                <td data-testid={`session-${s.id}-cost`}>{formatUsd(s.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}
