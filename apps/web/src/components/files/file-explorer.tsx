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
    <div className="file-explorer" data-testid="file-explorer">
      <header className="file-explorer-header">
        <h2>Files</h2>
        {explorer.roots.length > 1 ? (
          <select
            aria-label="Choose root"
            data-testid="root-select"
            value={explorer.rootId ?? ""}
            onChange={(e) => explorer.setRoot(e.target.value)}
          >
            {explorer.roots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        ) : null}
        <input
          type="search"
          className="file-search"
          data-testid="file-search"
          aria-label="Filter files"
          placeholder="Filter current folder…"
          value={explorer.search}
          onChange={(e) => explorer.setSearch(e.target.value)}
        />
      </header>

      <nav className="file-breadcrumbs" data-testid="file-breadcrumbs" aria-label="Path">
        {explorer.breadcrumbs.map((segment, index) => {
          const target = explorer.breadcrumbs.slice(1, index + 1).join("/");
          const isLast = index === explorer.breadcrumbs.length - 1;
          return (
            <span key={`${index}:${segment}`} className="crumb">
              {isLast ? (
                <span aria-current="location">{segment === "" ? "/" : segment}</span>
              ) : (
                <button type="button" onClick={() => explorer.openPath(target)}>
                  {segment === "" ? "/" : segment}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {explorer.path !== "" ? (
        <button type="button" className="file-up" data-testid="file-up" onClick={explorer.navigateUp}>
          ↑ Up one level
        </button>
      ) : null}

      {items.length === 0 ? (
        <StatePattern kind="empty" title="Empty folder" detail={explorer.search ? "No entries match the filter." : undefined} />
      ) : (
        <ul className="file-list" data-testid="file-list">
          {items.map((item) => (
            <li key={item.path} className={item.type} data-testid={`file-entry-${item.type}`}>
              {item.type === "directory" ? (
                <button type="button" className="file-name" onClick={() => explorer.openPath(item.path)}>
                  {item.name}/
                </button>
              ) : (
                <span className="file-name">{item.name}</span>
              )}
              <span className="file-size">{formatSize(item.size)}</span>
            </li>
          ))}
        </ul>
      )}

      {listing?.truncated ? <p className="file-truncated">Listing truncated — refine with the filter or descend into a folder.</p> : null}
    </div>
  );
}
