/**
 * TanStack Query hooks over the sessions API.
 *
 * - `useSessions`: infinite cursor-paged recent list.
 * - `useSessionSearch`: debounced query param (the component owns the
 *   debounce timing; the hook just keys the cache on the normalized query).
 * - `useSession`, mutations, and `useResumeSession`.
 *
 * Query keys are namespaced under `["sessions", ...]`; any mutation
 * invalidates the whole namespace so sidebar counts stay coherent.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseInfiniteQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  searchSessions,
  setSessionRunState,
  updateSession,
  type SessionDetail,
  type SessionPage,
  type SessionSummary,
} from "./sessions-api";

export const SESSIONS_KEY_ROOT = ["sessions"] as const;

export const sessionsKeys = {
  all: SESSIONS_KEY_ROOT,
  list: (limit: number) => [...SESSIONS_KEY_ROOT, "list", { limit }] as const,
  search: (query: string, limit: number) =>
    [...SESSIONS_KEY_ROOT, "search", { query, limit }] as const,
  detail: (id: string) => [...SESSIONS_KEY_ROOT, "detail", id] as const,
};

/** Infinite list of recent sessions. */
export function useSessions(limit = 20) {
  return useInfiniteSessions(limit);
}

export function useInfiniteSessions(limit = 20): UseInfiniteQueryResult<{
  pages: SessionPage[];
  pageParams: unknown[];
}> {
  return useInfiniteQuery<SessionPage, Error, { pages: SessionPage[]; pageParams: unknown[] }>({
    queryKey: sessionsKeys.list(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listSessions({ limit, cursor: pageParam as string | undefined, signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Debounced search; empty query disables the fetch. */
export function useSessionSearch(query: string, limit = 20) {
  const normalized = query.trim();
  return useQuery<SessionSummary[], Error>({
    queryKey: sessionsKeys.search(normalized, limit),
    queryFn: ({ signal }) => searchSessions({ query: normalized, limit, signal }),
    enabled: normalized.length > 0,
    staleTime: 5_000,
  });
}

export function useSession(id: string | undefined) {
  return useQuery<SessionDetail, Error>({
    queryKey: sessionsKeys.detail(id ?? ""),
    queryFn: ({ signal }) => getSession(id!, signal),
    enabled: id !== undefined && id !== "",
  });
}

export function useCreateSession(): UseMutationResult<
  SessionSummary,
  Error,
  { title?: string; model?: string; provider?: string; parentSessionId?: string } | undefined
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => createSession(input ?? {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SESSIONS_KEY_ROOT }),
  });
}

export function useUpdateSession(): UseMutationResult<
  SessionSummary,
  Error,
  { id: string; patch: { title?: string; status?: "active" | "archived" } }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => updateSession(id, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SESSIONS_KEY_ROOT }),
  });
}

export function useDeleteSession(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => deleteSession(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SESSIONS_KEY_ROOT }),
  });
}

/**
 * Resume a session: marking an interrupted run active again. Server-side the
 * session's runState flips to `running`; the query cache is refreshed so the
 * sidebar shows the session as resumable/in-progress.
 */
export function useResumeSession(): UseMutationResult<SessionSummary, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => setSessionRunState(id, "running"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SESSIONS_KEY_ROOT }),
  });
}
