import { createFileRoute } from "@tanstack/react-router";
import { StatePattern } from "@jarvis/ui";

export const Route = createFileRoute("/kanban")({
  component: () => <StatePattern kind="empty" title="No board connected" detail="The kanban module lands in a later milestone." />,
});
