import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInfiniteSessions, useSessionSearch, useResumeSession, useDeleteSession } from "@/lib/use-sessions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { SessionSummary } from "@/lib/sessions-api";

/** Fresh QueryClient per mount so cached entries never leak across mounts. */
export function SessionHistoryPanel() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionHistoryInner />
    </QueryClientProvider>
  );
}

function SessionHistoryInner() {
  const [rawQuery, setRawQuery] = useState("");
  // Debounce the raw search box into the query actually used for fetching.
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery), 300);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const search = useSessionSearch(query, 20);
  const list = useInfiniteSessions(20);
  const resume = useResumeSession();
  const remove = useDeleteSession();

  const items: SessionSummary[] = query.trim().length > 0 ? (search.data ?? []) : listFlat(list.data?.pages);
  const showSearchSpinner = query.trim().length > 0 && search.isFetching;
  const showListSpinner = query.trim().length === 0 && list.isFetching && items.length === 0;
  const canLoadMore = query.trim().length === 0 && list.hasNextPage && !list.isFetchingNextPage;

  return (
    <div className="sidebar-section space-y-2" data-slot="recent-sessions" data-testid="session-history">
      <p className="sidebar-heading">Recent</p>
      <Input
        type="search"
        className="session-search h-8"
        data-testid="session-search"
        aria-label="Search sessions"
        placeholder="Search sessions…"
        value={rawQuery}
        onChange={(e) => setRawQuery(e.target.value)}
      />
      {showSearchSpinner || showListSpinner ? (
        <p role="status" data-testid="sessions-loading" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-3" /> Loading…
        </p>
      ) : null}
      {items.length === 0 && !showSearchSpinner && !showListSpinner ? (
        <p className="session-empty text-sm text-muted-foreground" data-testid="sessions-empty">
          {query.trim().length > 0 ? "No matching sessions" : "No sessions yet"}
        </p>
      ) : (
        <ul className="recent-sessions space-y-1" aria-label="Recent sessions" data-testid="session-list">
          {items.map((s) => (
            <li key={s.id} data-testid="session-item" data-session-id={s.id} className="flex items-center gap-1">
              <Link
                to="/chat"
                search={{ session: s.id }}
                className="session-link min-w-0 flex-1 rounded-md px-2 py-1.5 hover:bg-sidebar-accent"
                title={s.title || "Untitled session"}
              >
                <span className="session-title block truncate text-sm">{s.title || "Untitled session"}</span>
                <span className="session-meta block text-xs text-muted-foreground">
                  {s.messageCount} msg{s.messageCount === 1 ? "" : "s"}
                  {s.resumable ? " · resumable" : ""}
                </span>
              </Link>
              {s.resumable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  aria-label={`Resume session ${s.title || s.id}`}
                  data-testid={`resume-${s.id}`}
                  disabled={resume.isPending}
                  onClick={() => resume.mutate(s.id)}
                >
                  Resume
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                aria-label={`Delete session ${s.title || s.id}`}
                data-testid={`delete-${s.id}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(s.id)}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
      {canLoadMore ? (
        <Button variant="ghost" size="sm" className="w-full" data-testid="sessions-load-more" onClick={() => void list.fetchNextPage()}>
          Load more
        </Button>
      ) : null}
      {search.isError && query.trim().length > 0 ? (
        <p role="alert" data-testid="sessions-error">
          Search failed
        </p>
      ) : null}
    </div>
  );
}

function listFlat(pages: Array<{ items: SessionSummary[] }> | undefined): SessionSummary[] {
  return pages?.flatMap((p) => p.items) ?? [];
}

/** Preserved for the sidebar slot; unused externally is fine. */
export type { ReactNode };
