import { createFileRoute } from "@tanstack/react-router";
import { StatePattern } from "@jarvis/ui";

export const Route = createFileRoute("/gateway")({
  component: () => <StatePattern kind="empty" title="Gateway status pending" detail="Health overview arrives with gateway status instrumentation." />,
});
