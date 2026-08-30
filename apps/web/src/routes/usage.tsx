import { createFileRoute } from "@tanstack/react-router";
import { StatePattern, Panel } from "@jarvis/ui";
import { useUsage, USAGE_POLL_INTERVAL_MS } from "@/hooks/useUsage";
import { UsageTicker } from "@/components/usage/usage-ticker";
import { formatUsd } from "@/components/usage/format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <section aria-labelledby="usage-title" className="space-y-4">
      <h1 id="usage-title" className="text-lg font-semibold">Usage &amp; Cost</h1>
      <UsageTicker totals={data.totals} live={isLive} />
      <Button variant="outline" size="sm" onClick={() => void refetch()} data-testid="usage-refresh">
        Refresh
      </Button>
      <p data-testid="usage-poll-interval" className="text-sm text-muted-foreground">
        Auto-refreshes every {Math.round(USAGE_POLL_INTERVAL_MS / 1000)}s.
      </p>
      <Panel>
        <h2 className="mb-2 font-medium">Per-session usage</h2>
        <Table>
          <TableCaption>Sessions by token usage and cost</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Session</TableHead>
              <TableHead scope="col">Messages</TableHead>
              <TableHead scope="col">Input tokens</TableHead>
              <TableHead scope="col">Output tokens</TableHead>
              <TableHead scope="col">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id} data-testid={`session-${s.id}`}>
                <TableCell className="font-medium">{s.label || s.id}</TableCell>
                <TableCell>{s.messages}</TableCell>
                <TableCell>{new Intl.NumberFormat("en-US").format(s.inputTokens)}</TableCell>
                <TableCell>{new Intl.NumberFormat("en-US").format(s.outputTokens)}</TableCell>
                <TableCell data-testid={`session-${s.id}-cost`}>{formatUsd(s.costUsd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </section>
  );
}
