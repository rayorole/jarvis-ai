/**
 * Sidebar session-history panel (issue #7).
 *
 * Lists recent sessions via TanStack Query (cursor-paged infinite list),
 * provides debounced search across titles and message content, and offers
 * one-click resume for interrupted sessions. Navigation goes to
 * `/chat?session=<id>`; the chat route owns resuming the thread.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useDeleteSession,
  useInfiniteSessions,
  useResumeSession,
  useSessionSearch,
} from "../../lib/use-sessions";
import type { SessionSummary } from "../../lib/sessions-api";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** Self-contained provider wrapper so AppShell consumers don't need one. */
export function SessionHistoryPanel(): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionHistory />
    </QueryClientProvider>
  );
}

const DEBOUNCE_MS = 200;

function SessionHistory() {
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery), DEBOUNCE_MS);
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
    <div className="sidebar-section" data-slot="recent-sessions" data-testid="session-history">
      <p className="sidebar-heading">Recent</p>
      <input
        type="search"
        className="session-search"
        data-testid="session-search"
        aria-label="Search sessions"
        placeholder="Search sessions…"
        value={rawQuery}
        onChange={(e) => setRawQuery(e.target.value)}
      />
      {showSearchSpinner || showListSpinner ? (
        <p role="status" data-testid="sessions-loading">
          Loading…
        </p>
      ) : null}
      {items.length === 0 && !showSearchSpinner && !showListSpinner ? (
        <p className="session-empty" data-testid="sessions-empty">
          {query.trim().length > 0 ? "No matching sessions" : "No sessions yet"}
        </p>
      ) : (
        <ul className="recent-sessions" aria-label="Recent sessions" data-testid="session-list">
          {items.map((s) => (
            <li key={s.id} data-testid="session-item" data-session-id={s.id}>
              <Link to="/chat" search={{ session: s.id }} className="session-link" title={s.title || "Untitled session"}>
                <span className="session-title">{s.title || "Untitled session"}</span>
                <span className="session-meta">
                  {s.messageCount} msg{s.messageCount === 1 ? "" : "s"}
                  {s.resumable ? " · resumable" : ""}
                </span>
              </Link>
              {s.resumable ? (
                <button
                  type="button"
                  className="session-action"
                  aria-label={`Resume session ${s.title || s.id}`}
                  data-testid={`resume-${s.id}`}
                  disabled={resume.isPending}
                  onClick={() => resume.mutate(s.id)}
                >
                  Resume
                </button>
              ) : null}
              <button
                type="button"
                className="session-action"
                aria-label={`Delete session ${s.title || s.id}`}
                data-testid={`delete-${s.id}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(s.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {canLoadMore ? (
        <button type="button" className="session-action" data-testid="sessions-load-more" onClick={() => void list.fetchNextPage()}>
          Load more
        </button>
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
