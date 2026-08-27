import { createFileRoute } from "@tanstack/react-router";
import { StatePattern } from "@jarvis/ui";

export const Route = createFileRoute("/memory")({
  component: () => <StatePattern kind="empty" title="Memory viewer pending" detail="This module is populated in a later milestone." />,
});
