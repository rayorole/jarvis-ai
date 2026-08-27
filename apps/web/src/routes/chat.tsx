import { createFileRoute } from "@tanstack/react-router";
import { StatePattern } from "@jarvis/ui";

/** Placeholder route; the chat module populates this workspace slot later. */
export const Route = createFileRoute("/chat")({
  component: () => (
    <StatePattern kind="empty" title="No conversation open" detail="Start a new chat from the sidebar." />
  ),
});
