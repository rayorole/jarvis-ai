/**
 * Typed client for the Jarvis memory API (`/api/memory*`).
 *
 * Issue #11/#12 seam: agent memory and user profile stores with character
 * budgets, provenance, and staged (pending) writes. All responses are
 * validated shape-wise so malformed server payloads degrade to a canonical
 * empty store, never a crash.
 */

export type MemoryTab = "agent" | "profile";
export type MemoryOrigin = "manual" | "automatic";

export interface MemoryEntry {
  id: string;
  content: string;
  origin: MemoryOrigin;
  enabled: boolean;
  updatedAt: string;
}

export interface MemoryBudget {
  used: number;
  limit: number;
}

export interface PendingWrite {
  id: string;
  operation: "add" | "replace" | "remove";
  content: string | null;
  entryId: string | null;
  origin: MemoryOrigin;
}

export interface MemoryStore {
  tab: MemoryTab;
  budget: MemoryBudget;
  version: number;
  entries: MemoryEntry[];
  pendingWrites: PendingWrite[];
}

export interface MemoryMutation {
  operation: "add" | "replace" | "remove";
  content?: string | null;
  entryId?: string | null;
  expectedVersion: number;
  /** "stage" registers a pending write; "commit" approves it for application. */
  stage: "stage" | "commit";
  pendingWriteId?: string;
}

export class MemoryApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: unknown,
  ) {
    super(`memory api error ${status}`);
    this.name = "MemoryApiError";
  }
}

export const MEMORY_PATH = "/api/memory";
/** Bounded input length enforced client-side; server budgets remain canonical. */
export const MEMORY_MAX_CONTENT_LENGTH = 2000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeOrigin(v: unknown): MemoryOrigin {
  return v === "automatic" ? "automatic" : "manual";
}

function normalizeEntry(v: unknown): MemoryEntry | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string" || typeof v.content !== "string") return null;
  return {
    id: v.id,
    content: v.content,
    origin: normalizeOrigin(v.origin),
    enabled: v.enabled !== false,
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "",
  };
}

function normalizePending(v: unknown): PendingWrite | null {
  if (!isRecord(v) || typeof v.id !== "string") return null;
  const operation = v.operation;
  if (operation !== "add" && operation !== "replace" && operation !== "remove") return null;
  return {
    id: v.id,
    operation,
    content: typeof v.content === "string" ? v.content : null,
    entryId: typeof v.entryId === "string" ? v.entryId : null,
    origin: normalizeOrigin(v.origin),
  };
}

/** Contract normalization: malformed payloads degrade to a valid empty store. */
export function normalizeStore(v: unknown, tab: MemoryTab): MemoryStore {
  if (!isRecord(v)) return { tab, budget: { used: 0, limit: 0 }, version: 0, entries: [], pendingWrites: [] };
  const budget = isRecord(v.budget)
    ? {
        used: typeof v.budget.used === "number" ? v.budget.used : 0,
        limit: typeof v.budget.limit === "number" ? v.budget.limit : 0,
      }
    : { used: 0, limit: 0 };
  return {
    tab,
    budget,
    version: typeof v.version === "number" ? v.version : 0,
    entries: Array.isArray(v.entries)
      ? v.entries.map(normalizeEntry).filter((e): e is MemoryEntry => e !== null)
      : [],
    pendingWrites: Array.isArray(v.pendingWrites)
      ? v.pendingWrites.map(normalizePending).filter((p): p is PendingWrite => p !== null)
      : [],
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new MemoryApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export async function getMemoryStore(tab: MemoryTab, signal?: AbortSignal): Promise<MemoryStore> {
  const body = await request<unknown>(`${MEMORY_PATH}?tab=${tab}`, { signal });
  return normalizeStore(body, tab);
}

/** Stage or commit a memory mutation. Staging returns the pending write. */
export function mutateMemory(
  tab: MemoryTab,
  mutation: MemoryMutation,
  signal?: AbortSignal,
): Promise<{ ok?: boolean; pendingWrite?: PendingWrite }> {
  return request(`${MEMORY_PATH}/entries`, {
    method: "POST",
    body: JSON.stringify({ tab, ...mutation }),
    signal,
  });
}

/** Approve or reject an existing pending write. */
export function decidePendingWrite(
  tab: MemoryTab,
  pendingWriteId: string,
  action: "approve" | "reject",
  signal?: AbortSignal,
): Promise<{ ok?: boolean }> {
  return request(`${MEMORY_PATH}/pending/${encodeURIComponent(pendingWriteId)}`, {
    method: "POST",
    body: JSON.stringify({ tab, action }),
    signal,
  });
}
