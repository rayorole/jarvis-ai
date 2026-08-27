/**
 * Normalizers: convert unverified upstream JSON into stable Jarvis domain
 * types. UI code consumes only these types — raw upstream payloads never
 * cross this boundary.
 */

export type SessionStatus = "active" | "archived" | "unknown";

export interface JarvisSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  provider: string;
  status: SessionStatus;
  messageCount: number;
}

export interface JarvisMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  createdAt: string;
}

export function normalizeSession(raw: unknown): JarvisSessionSummary {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("upstream session payload is not an object");
  }
  const r = raw as Record<string, unknown>;
  return {
    id: str(r.id),
    title: typeof r.title === "string" ? r.title : "",
    createdAt: isoOrEpoch(r.createdAt, "createdAt"),
    updatedAt: isoOrEpoch(r.updatedAt, "updatedAt"),
    model: typeof r.model === "string" ? r.model : "unknown",
    provider: typeof r.provider === "string" ? r.provider : "unknown",
    status:
      r.status === "active" || r.status === "archived"
        ? r.status
        : "unknown",
    messageCount: typeof r.messageCount === "number" ? Math.max(0, Math.trunc(r.messageCount)) : 0,
  };
}

export function normalizeMessage(sessionId: string, raw: unknown): JarvisMessage {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("upstream message payload is not an object");
  }
  const r = raw as Record<string, unknown>;
  const role =
    r.role === "user" || r.role === "assistant" || r.role === "tool" || r.role === "system"
      ? r.role
      : "system";
  const content =
    typeof r.content === "string"
      ? r.content
      : Array.isArray(r.content)
        ? r.content
            .filter((p): p is { text?: string } => typeof p === "object" && p !== null && "text" in p)
            .map((p) => String(p.text ?? ""))
            .join("")
        : "";
  return {
    id: str(r.id),
    sessionId,
    role,
    content,
    createdAt: isoOrEpoch(r.createdAt ?? r.timestamp, "createdAt"),
  };
}

function str(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("upstream payload missing required string field");
  }
  return value;
}

function isoOrEpoch(value: unknown, field: string): string {
  if (value === undefined || value === null) {
    return new Date(0).toISOString(); // safe default for absent timestamps
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(
      value > 1e12 ? value : value * 1000,
    ).toISOString();
  }
  throw new Error(`upstream payload field ${field} is not a timestamp`);
}
