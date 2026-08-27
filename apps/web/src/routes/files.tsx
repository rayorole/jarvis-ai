import { createFileRoute } from "@tanstack/react-router";
import { StatePattern } from "@jarvis/ui";

export const Route = createFileRoute("/files")({
  component: () => <StatePattern kind="empty" title="File explorer pending" detail="This module is populated in a later milestone." />,
});
