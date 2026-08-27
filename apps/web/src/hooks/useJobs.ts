/**
 * Data hooks for the jobs viewer. All upstream contact goes through the
 * same-origin gateway proxy; payloads are normalized before any component
 * sees them. Mutations include the CSRF token and roll back optimistic
 * pause/resume updates on failure.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  normalizeIncident,
  normalizeJob,
  normalizeProcess,
  normalizeRun,
  type JarvisIncident,
  type JarvisJob,
  type JarvisRun,
} from "@/lib/jobs";

export const JOBS_QUERY_KEY = ["jobs"] as const;
export const RUNS_QUERY_KEY = ["runs"] as const;
export const PROCESSES_QUERY_KEY = ["processes"] as const;
export const INCIDENTS_QUERY_KEY = ["incidents"] as const;

async function getJson<T>(url: string, normalize: (raw: unknown) => T): Promise<T[]> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  const body: unknown = await res.json();
  const items = Array.isArray(body) ? body : Array.isArray((body as { items?: unknown[] }).items) ? (body as { items: unknown[] }).items : [];
  return items.map(normalize);
}

async function sendJson(url: string, method: string, body?: unknown): Promise<void> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  // CSRF token is set by the auth module as a readable cookie mirror.
  const csrf = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/)?.[1];
  if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
}

export function useJobs() {
  return useQuery({
    queryKey: JOBS_QUERY_KEY,
    queryFn: () => getJson<JarvisJob>("/api/gateway/jobs", normalizeJob),
  });
}

export function useRuns(jobId?: string) {
  return useQuery({
    queryKey: jobId ? [...RUNS_QUERY_KEY, jobId] : RUNS_QUERY_KEY,
    queryFn: () => getJson<JarvisRun>(jobId ? `/api/gateway/jobs/${encodeURIComponent(jobId)}/runs` : "/api/gateway/runs", normalizeRun),
  });
}

export function useProcesses() {
  return useQuery({
    queryKey: PROCESSES_QUERY_KEY,
    queryFn: () => getJson<ReturnType<typeof normalizeProcess>>("/api/gateway/processes", normalizeProcess),
  });
}

export function useIncidents() {
  return useQuery({
    queryKey: INCIDENTS_QUERY_KEY,
    queryFn: () => getJson<JarvisIncident>("/api/gateway/incidents", normalizeIncident),
  });
}

export type JobAction = "pause" | "resume" | "run-now" | "remove" | "acknowledge";

/** Fire a job mutation; run-now is asynchronous by design. */
async function jobAction(jobId: string, action: JobAction): Promise<void> {
  const id = encodeURIComponent(jobId);
  switch (action) {
    case "pause":
      return sendJson(`/api/gateway/jobs/${id}/pause`, "POST");
    case "resume":
      return sendJson(`/api/gateway/jobs/${id}/resume`, "POST");
    case "run-now":
      // Starts asynchronously; the caller must poll until terminal state.
      return sendJson(`/api/gateway/jobs/${id}/run`, "POST");
    case "remove":
      return sendJson(`/api/gateway/jobs/${id}`, "DELETE");
    case "acknowledge":
      return sendJson(`/api/gateway/incidents/${id}/acknowledge`, "POST");
  }
}

export function useJobAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: JobAction }) => jobAction(jobId, action),
    onSuccess: (_data, variables) => {
      if (variables.action === "acknowledge") {
        void queryClient.invalidateQueries({ queryKey: INCIDENTS_QUERY_KEY });
      } else {
        void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY });
      }
    },
  });
}

/**
 * Optimistic pause/resume with rollback: flips the job's enabled/state fields
 * in the cache immediately and restores the previous snapshot on failure.
 */
export function useOptimisticToggle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: "pause" | "resume" }) =>
      optimisticToggle(queryClient, jobId, action, () => jobAction(jobId, action)),
    onError: (_err, _vars) => {
      // Cache already restored by optimisticToggle rollback.
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
    },
  });
}

function optimisticToggle(
  queryClient: QueryClient,
  jobId: string,
  action: "pause" | "resume",
  perform: () => Promise<void>,
): Promise<void> {
  const key = [...JOBS_QUERY_KEY];
  const previous = queryClient.getQueryData<JarvisJob[]>(key);
  if (previous) {
    queryClient.setQueryData<JarvisJob[]>(key, (jobs) =>
      (jobs ?? []).map((j) =>
        j.id === jobId
          ? {
              ...j,
              enabled: action === "resume",
              state: action === "pause" ? "paused" : "queued",
            }
          : j,
      ),
    );
  }
  return perform().catch((err) => {
    if (previous) queryClient.setQueryData(key, previous);
    throw err;
  });
}