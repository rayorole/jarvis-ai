/**
 * Gateway health/status domain (issue #13).
 *
 * Normalizes unverified JSON from the same-origin health endpoint into stable
 * Jarvis types. Unknown states map to "unknown" rather than being guessed;
 * malformed payloads degrade to an empty offline view, never a crash.
 */

export const GATEWAY_HEALTH_PATH = "/api/gateway/health";

export type GatewayHealthState = "online" | "degraded" | "offline" | "unknown";
export type GatewayChannelState = "online" | "degraded" | "offline" | "unknown";

export interface GatewayChannelHealth {
  id: string;
  kind: string;
  status: GatewayChannelState;
  /** Safe display detail; server is expected to redact secrets. */
  detail?: string;
}

export interface GatewayHealth {
  status: GatewayHealthState;
  checkedAt?: string;
  channels: GatewayChannelHealth[];
}

const HEALTH_STATES: readonly GatewayHealthState[] = ["online", "degraded", "offline", "unknown"];
const CHANNEL_STATES: readonly GatewayChannelState[] = ["online", "degraded", "offline", "unknown"];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).indexOf(value) !== -1 ? (value as T) : fallback;
}

function normalizeChannel(raw: unknown): GatewayChannelHealth | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" || c.id === "") return null;
  const detail = typeof c.detail === "string" && c.detail !== "" ? c.detail : undefined;
  return {
    id: c.id,
    kind: typeof c.kind === "string" && c.kind !== "" ? c.kind : c.id,
    status: oneOf(c.status, CHANNEL_STATES, "unknown"),
    ...(detail ? { detail } : {}),
  };
}

export function normalizeGatewayHealth(raw: unknown): GatewayHealth {
  if (typeof raw !== "object" || raw === null) {
    return { status: "unknown", channels: [] };
  }
  const h = raw as Record<string, unknown>;
  const channels = Array.isArray(h.channels)
    ? h.channels.map(normalizeChannel).filter((c): c is GatewayChannelHealth => c !== null)
    : [];
  const checkedAt = typeof h.checkedAt === "string" && h.checkedAt !== "" ? h.checkedAt : undefined;
  return {
    status: oneOf(h.status, HEALTH_STATES, "unknown"),
    ...(checkedAt ? { checkedAt } : {}),
    channels,
  };
}

/** Fetch gateway health from the same-origin endpoint. */
export async function fetchGatewayHealth(signal?: AbortSignal): Promise<GatewayHealth> {
  const res = await fetch(GATEWAY_HEALTH_PATH, { headers: { accept: "application/json" }, signal });
  if (!res.ok) {
    throw new Error(`gateway health request failed: ${res.status}`);
  }
  const body: unknown = await res.json();
  return normalizeGatewayHealth(body);
}
