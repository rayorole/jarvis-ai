import { createFileRoute } from "@tanstack/react-router";
import { Panel, StatePattern, StatusDot, type StatusState } from "@jarvis/ui";
import { useGatewayHealth } from "@/lib/use-gateway-status";
import type { GatewayHealth, GatewayHealthState } from "@/lib/gateway-status";

export const Route = createFileRoute("/gateway")({
  component: GatewayRoute,
});

function toDotState(state: GatewayHealthState): StatusState {
  switch (state) {
    case "online":
      return "online";
    case "degraded":
      return "degraded";
    case "offline":
      return "offline";
    default:
      return "unknown";
  }
}

function GatewayRoute() {
  const { data, isPending, isError, error, refetch } = useGatewayHealth();

  if (isPending) return <StatePattern kind="loading" title="Checking gateway health" />;
  if (isError) {
    // Distinguish network-level failure (offline) from a server error.
    if (error instanceof TypeError) {
      return <StatePattern kind="offline" title="Gateway unreachable" detail={error.message} retry={() => void refetch()} />;
    }
    return (
      <StatePattern
        kind="error"
        title="Could not load gateway health"
        detail={error instanceof Error ? error.message : undefined}
        retry={() => void refetch()}
      />
    );
  }
  return <HealthView health={data as GatewayHealth} retry={() => void refetch()} />;
}

function HealthView({ health, retry }: { health: GatewayHealth; retry: () => void }) {
  if (health.status === "unknown") {
    return (
      <StatePattern
        kind="error"
        title="Gateway reported an unrecognized state"
        detail="The health endpoint responded, but its status was not understood."
        retry={retry}
      />
    );
  }
  return (
    <section aria-labelledby="gateway-title">
      <h1 id="gateway-title">Gateway</h1>
      <Panel>
        <div data-testid="gateway-overall-status">
          <StatusDot state={toDotState(health.status)} label={health.status} />
        </div>
        {health.checkedAt ? <p>Last checked: {health.checkedAt}</p> : null}
      </Panel>
      <h2>Channels</h2>
      {health.channels.length === 0 ? (
        <p>No channels reported.</p>
      ) : (
        <ul>
          {health.channels.map((channel) => (
            <li key={channel.id} data-testid={`channel-badge-${channel.id}`}>
              <StatusDot state={toDotState(channel.status)} label={channel.status} />
              <span> {channel.kind}</span>
              {channel.detail ? <span> — {channel.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
