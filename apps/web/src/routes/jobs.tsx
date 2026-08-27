import { createFileRoute } from "@tanstack/react-router";
import { StatePattern } from "@jarvis/ui";

export const Route = createFileRoute("/jobs")({
  component: () => <StatePattern kind="empty" title="No jobs configured" detail="Background job controls arrive in a later milestone." />,
});
