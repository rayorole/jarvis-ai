import { createFileRoute } from "@tanstack/react-router";
import { MemoryViewer } from "../components/memory/memory-viewer";

export const Route = createFileRoute("/memory")({
  component: MemoryViewer,
});
