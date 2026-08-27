/**
 * Session store: durable conversation state for Jarvis sessions.
 *
 * In-memory default (issue #7 baseline); the public seam is intentionally
 * synchronous and storage-agnostic so a SQLite backend can slot in behind the
 * same interface. All records are normalized defensively on read so a corrupt
 * or malformed record can never crash a listing.
 */

export type SessionStatus = "active" | "archived";
export type RunState = "idle" | "running" | "completed" | "failed" | "cancelled";
export type MessageRole = "user" | "assistant" | "tool" | "system";

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
  /** Resume is offered only for sessions that can meaningfully continue. */
  resumable: boolean;
  parentSessionId?: string;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface SessionDetail extends SessionSummary {
  messages: SessionMessage[];
  /** Child sessions branched from this one (newest first). */
  children: Array<Pick<SessionSummary, "id" | "title" | "createdAt">>;
}

export interface SessionPage {
  items: SessionSummary[];
  /** Opaque cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
}

export interface CreateSessionInput {
  title?: string;
  model?: string;
  provider?: string;
  parentSessionId?: string;
}

interface InternalRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  provider: string;
  status: SessionStatus;
  runState: RunState;
  messages: SessionMessage[];
  parentSessionId?: string;
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

function generateId(): string {
  const bytes = new Uint8Array(21);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += ID_ALPHABET[b % ID_ALPHABET.length];
  return id;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampNonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function normalizeRole(value: unknown): MessageRole {
  return value === "user" || value === "assistant" || value === "tool" ? value : "system";
}

function normalizeStatus(value: unknown): SessionStatus {
  return value === "archived" ? "archived" : "active";
}

function normalizeRunState(value: unknown): RunState {
  return value === "running" || value === "completed" || value === "failed" || value === "cancelled"
    ? value
    : "idle";
}

function resumableFor(record: { runState: RunState; status: SessionStatus }): boolean {
  // Incomplete / interrupted work is explicitly resumable; a finished run or
  // an archived session is not.
  if (record.status === "archived") return false;
  return record.runState === "running" || record.runState === "failed" || record.runState === "cancelled" || record.runState === "idle";
}

function toSummary(record: InternalRecord): SessionSummary {
  const messageCount = clampNonNegativeInt(record.messages.length);
  const status = normalizeStatus(record.status);
  const runState = normalizeRunState(record.runState);
  return {
    id: record.id,
    title: typeof record.title === "string" ? record.title : "",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    model: typeof record.model === "string" && record.model !== "" ? record.model : "unknown",
    provider: typeof record.provider === "string" && record.provider !== "" ? record.provider : "unknown",
    status,
    runState,
    messageCount,
    resumable: resumableFor({ runState, status }),
    ...(record.parentSessionId !== undefined ? { parentSessionId: record.parentSessionId } : {}),
  };
}

/** Opaque, deterministic cursor: base64url of `${updatedAt}|${id}`. */
function encodeCursor(record: InternalRecord): string {
  const payload = `${record.updatedAt}|${record.id}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { updatedAt: string; id: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new Error("invalid session cursor");
  }
  const sep = decoded.lastIndexOf("|");
  if (sep <= 0) throw new Error("invalid session cursor");
  const updatedAt = decoded.slice(0, sep);
  const id = decoded.slice(sep + 1);
  if (updatedAt === "" || id === "") throw new Error("invalid session cursor");
  return { updatedAt, id };
}

export interface ListOptions {
  limit?: number;
  cursor?: string;
}

export interface SearchOptions extends ListOptions {
  query: string;
}

export interface SessionStore {
  create(input?: CreateSessionInput): SessionSummary;
  get(id: string): SessionSummary | undefined;
  detail(id: string): SessionDetail;
  list(options: ListOptions): SessionPage;
  search(options: SearchOptions): SessionSummary[];
  rename(id: string, title: string): SessionSummary;
  setStatus(id: string, status: SessionStatus): SessionSummary;
  markRunState(id: string, runState: RunState): SessionSummary;
  appendMessage(id: string, message: { role: MessageRole; content: string }): SessionMessage;
  branch(id: string, fromMessageId: string): SessionSummary;
  delete(id: string): void;
  /** Test seam: the raw records map (used only to simulate corruption). */
  records: Map<string, InternalRecord>;
}

export function createSessionStore(): SessionStore {
  const records = new Map<string, InternalRecord>();

  function requireRecord(id: string): InternalRecord {
    const record = records.get(id);
    if (record === undefined) {
      throw new Error(`session ${id} not found`);
    }
    return record;
  }

  function touch(record: InternalRecord): void {
    record.updatedAt = nowIso();
  }

  /** Stable sort: newest-updated first, id as a deterministic tiebreaker. */
  function sortedAll(): InternalRecord[] {
    return [...records.values()].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });
  }

  function listPage(items: InternalRecord[], limit: number): SessionPage {
    const slice = items.slice(0, limit);
    const nextCursor =
      items.length > limit && slice.length > 0 ? encodeCursor(slice[slice.length - 1]!) : null;
    return { items: slice.map(toSummary), nextCursor };
  }

  const store: SessionStore = {
    records,

    create(input: CreateSessionInput = {}) {
      const now = nowIso();
      const record: InternalRecord = {
        id: generateId(),
        title: typeof input.title === "string" ? input.title : "",
        createdAt: now,
        updatedAt: now,
        model: input.model ?? "unknown",
        provider: input.provider ?? "unknown",
        status: "active",
        runState: "idle",
        messages: [],
        ...(input.parentSessionId !== undefined ? { parentSessionId: input.parentSessionId } : {}),
      };
      records.set(record.id, record);
      return toSummary(record);
    },

    get(id) {
      const record = records.get(id);
      return record === undefined ? undefined : toSummary(record);
    },

    detail(id) {
      const record = requireRecord(id);
      const summary = toSummary(record);
      const children = sortedAll()
        .filter((r) => r.parentSessionId === id)
        .map((r) => ({ id: r.id, title: toSummary(r).title, createdAt: r.createdAt }));
      return {
        ...summary,
        messages: [...record.messages],
        children,
      };
    },

    list(options) {
      if (options.cursor !== undefined) {
        const anchor = decodeCursor(options.cursor);
        // Stale cursor (anchor deleted) is tolerated: it simply re-anchors.
        const anchorRecord = records.get(anchor.id);
        const after = sortedAll().filter((r) => {
          if (anchorRecord === undefined) return true;
          if (r.updatedAt !== anchor.updatedAt) return r.updatedAt < anchor.updatedAt;
          if (r.id === anchor.id) return false;
          return r.id < anchor.id;
        });
        return listPage(after, Math.max(1, options.limit ?? 20));
      }
      const limit = Math.max(1, options.limit ?? 20);
      return listPage(sortedAll(), limit);
    },

    search({ query, limit = 20, cursor }) {
      const needle = query.toLowerCase();
      if (needle === "") return [];
      const matches = sortedAll().filter((r) => {
        if (r.title.toLowerCase().includes(needle)) return true;
        return r.messages.some((m) => m.content.toLowerCase().includes(needle));
      });
      if (cursor !== undefined) {
        const anchor = decodeCursor(cursor);
        const idx = matches.findIndex((r) => r.id === anchor.id);
        return matches.slice(idx + 1, idx + 1 + Math.max(1, limit)).map(toSummary);
      }
      return matches.slice(0, Math.max(1, limit)).map(toSummary);
    },

    rename(id, title) {
      const record = requireRecord(id);
      record.title = title;
      touch(record);
      return toSummary(record);
    },

    setStatus(id, status) {
      const record = requireRecord(id);
      record.status = normalizeStatus(status);
      touch(record);
      return toSummary(record);
    },

    markRunState(id, runState) {
      const record = requireRecord(id);
      record.runState = normalizeRunState(runState);
      touch(record);
      return toSummary(record);
    },

    appendMessage(id, message) {
      const record = requireRecord(id);
      const msg: SessionMessage = {
        id: generateId(),
        sessionId: record.id,
        role: normalizeRole(message.role),
        content: typeof message.content === "string" ? message.content : "",
        createdAt: nowIso(),
      };
      record.messages.push(msg);
      touch(record);
      return msg;
    },

    branch(id, _fromMessageId) {
      const record = requireRecord(id);
      const child = store.create({
        title: `${record.title || "Session"} (branch)`,
        model: record.model,
        provider: record.provider,
        parentSessionId: record.id,
      });
      // Copy the parent's canonical history up to (and including) the fork
      // point message; unknown message ids fork the full history.
      const forkIdx = record.messages.findIndex((m) => m.id === _fromMessageId);
      const copied = record.messages.slice(0, forkIdx === -1 ? record.messages.length : forkIdx + 1);
      const childRecord = requireRecord(child.id);
      childRecord.messages = copied.map((m) => ({ ...m, id: generateId(), sessionId: child.id }));
      touch(childRecord);
      return store.get(child.id)!;
    },

    delete(id) {
      if (!records.delete(id)) {
        throw new Error(`session ${id} not found`);
      }
      // Clear dangling lineage references.
      for (const record of records.values()) {
        if (record.parentSessionId === id) delete record.parentSessionId;
      }
    },
  };

  return store;
}
