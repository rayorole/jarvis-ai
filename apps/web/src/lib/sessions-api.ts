/**
 * Typed client for the Jarvis sessions API (`/api/sessions*`).
 *
 * Thin fetch layer consumed by TanStack Query hooks; no state lives here.
 * All list/search responses are validated shape-wise before use so a
 * malformed server payload degrades to an empty list, never a crash.
 */

export type SessionStatus = "active" | "archived";
export type RunState = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  provider: string;
  status: SessionStatus;
  runState: RunState;
  messageCount: number;
  resumable: boolean;
  parentSessionId?: string;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  createdAt: string;
}

export interface SessionDetail extends SessionSummary {
  messages: SessionMessage[];
  children: Array<Pick<SessionSummary, "id" | "title" | "createdAt">>;
}

export interface SessionPage {
  items: SessionSummary[];
  nextCursor: string | null;
}

export const SESSIONS_PATH = "/api/sessions";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new SessionsApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class SessionsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: unknown,
  ) {
    super(`sessions api error ${status}`);
    this.name = "SessionsApiError";
  }
}

function isSessionSummary(v: unknown): v is SessionSummary {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.id === "string" && typeof s.updatedAt === "string";
}

function normalizePage(v: unknown): SessionPage {
  if (typeof v !== "object" || v === null || !Array.isArray((v as SessionPage).items)) {
    return { items: [], nextCursor: null };
  }
  const page = v as SessionPage;
  return { items: page.items.filter(isSessionSummary), nextCursor: page.nextCursor ?? null };
}

export interface ListSessionsOptions {
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}

/** List sessions, newest-updated first. */
export function listSessions(options: ListSessionsOptions = {}): Promise<SessionPage> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.cursor !== undefined) params.set("cursor", options.cursor);
  const qs = params.toString();
  return fetch(`${SESSIONS_PATH}${qs ? `?${qs}` : ""}`, { signal: options.signal })
    .then(async (res) => {
      if (!res.ok) throw new SessionsApiError(res.status, await res.json().catch(() => null));
      return normalizePage(await res.json());
    });
}

export interface SearchSessionsOptions {
  query: string;
  limit?: number;
  signal?: AbortSignal;
}

/** Search sessions by title and message content. */
export async function searchSessions(options: SearchSessionsOptions): Promise<SessionSummary[]> {
  const params = new URLSearchParams({ q: options.query });
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const res = await fetch(`${SESSIONS_PATH}?${params.toString()}`, { signal: options.signal });
  if (!res.ok) throw new SessionsApiError(res.status, await res.json().catch(() => null));
  const body: unknown = await res.json();
  const items = typeof body === "object" && body !== null && Array.isArray((body as { items?: unknown }).items)
    ? (body as { items: unknown[] }).items
    : [];
  return items.filter(isSessionSummary);
}

export function getSession(id: string, signal?: AbortSignal): Promise<SessionDetail> {
  return request<SessionDetail>(`${SESSIONS_PATH}/${encodeURIComponent(id)}`, { signal });
}

export function createSession(
  input: { title?: string; model?: string; provider?: string; parentSessionId?: string } = {},
): Promise<SessionSummary> {
  return request<SessionSummary>(SESSIONS_PATH, { method: "POST", body: JSON.stringify(input) });
}

export function updateSession(
  id: string,
  patch: { title?: string; status?: SessionStatus },
): Promise<SessionSummary> {
  return request<SessionSummary>(`${SESSIONS_PATH}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteSession(id: string): Promise<void> {
  return request<void>(`${SESSIONS_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function setSessionRunState(
  id: string,
  runState: "idle" | "running" | "completed" | "failed" | "cancelled",
): Promise<SessionSummary> {
  return request<SessionSummary>(`${SESSIONS_PATH}/${encodeURIComponent(id)}/run-state`, {
    method: "POST",
    body: JSON.stringify({ runState }),
  });
}

export function appendSessionMessage(
  id: string,
  message: { role: "user" | "assistant" | "tool" | "system"; content: string },
): Promise<SessionMessage> {
  return request<SessionMessage>(`${SESSIONS_PATH}/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify(message),
  });
}
