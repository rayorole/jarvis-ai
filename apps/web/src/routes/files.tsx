import { createFileRoute } from "@tanstack/react-router";
import { FileExplorer } from "@/components/files/file-explorer";

export const Route = createFileRoute("/files")({
  component: FileExplorer,
});
