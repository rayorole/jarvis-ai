/**
 * File workspace explorer UI (issue #12).
 *
 * Renders the approved roots and the current directory listing from the
 * `/api/files` API. Clicking a directory descends into it; breadcrumbs
 * navigate back up. A client-side search filter narrows the current
 * listing. All filesystem details stay server-side — the UI only ever
 * sees root-relative paths already redacted by the API.
 */
import type { ReactNode } from "react";
import { StatePattern } from "@jarvis/ui";
import { useFileExplorer } from "../../lib/use-file-explorer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

function formatSize(size: number | null): string {
  if (size === null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileExplorer(): ReactNode {
  const explorer = useFileExplorer();

  if (explorer.status === "loading") {
    return <StatePattern kind="loading" title="Loading files…" />;
  }

  if (explorer.status === "error") {
    return <StatePattern kind="empty" title="File explorer unavailable" detail={explorer.error ?? "Unable to load files"} />;
  }

  const listing = explorer.listing;
  const items = explorer.filteredItems;

  return (
    <div className="file-explorer space-y-3" data-testid="file-explorer">
      <header className="file-explorer-header flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Files</h2>
        {explorer.roots.length > 1 ? (
          <Select
            value={explorer.rootId ?? ""}
            onValueChange={(v) => explorer.setRoot(v)}
          >
            <SelectTrigger className="w-44" aria-label="Choose root" data-testid="root-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {explorer.roots.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Input
          type="search"
          className="file-search max-w-xs"
          data-testid="file-search"
          aria-label="Filter files"
          placeholder="Filter current folder…"
          value={explorer.search}
          onChange={(e) => explorer.setSearch(e.target.value)}
        />
      </header>

      <nav className="file-breadcrumbs flex flex-wrap items-center gap-1" data-testid="file-breadcrumbs" aria-label="Path">
        {explorer.breadcrumbs.map((segment, index) => {
          const target = explorer.breadcrumbs.slice(1, index + 1).join("/");
          const isLast = index === explorer.breadcrumbs.length - 1;
          return (
            <span key={`${index}:${segment}`} className="crumb">
              {isLast ? (
                <span aria-current="location" className="text-sm text-muted-foreground">{segment === "" ? "/" : segment}</span>
              ) : (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => explorer.openPath(target)}>
                  {segment === "" ? "/" : segment}
                </Button>
              )}
            </span>
          );
        })}
      </nav>

      {explorer.path !== "" ? (
        <Button variant="outline" size="sm" className="file-up" data-testid="file-up" onClick={explorer.navigateUp}>
          ↑ Up one level
        </Button>
      ) : null}

      {items.length === 0 ? (
        <StatePattern kind="empty" title="Empty folder" detail={explorer.search ? "No entries match the filter." : undefined} />
      ) : (
        <ul className="file-list space-y-1" data-testid="file-list">
          {items.map((item) => (
            <li key={item.path} className={item.type} data-testid={`file-entry-${item.type}`}>
              <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
                {item.type === "directory" ? (
                  <Button variant="ghost" size="sm" className="file-name h-auto p-0 font-normal" onClick={() => explorer.openPath(item.path)}>
                    {item.name}/
                  </Button>
                ) : (
                  <span className="file-name">{item.name}</span>
                )}
                <span className="file-size text-xs text-muted-foreground">{formatSize(item.size)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {listing?.truncated ? <p className="file-truncated text-sm text-amber-400">Listing truncated — refine with the filter or descend into a folder.</p> : null}
    </div>
  );
}
