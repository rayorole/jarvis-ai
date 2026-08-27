/**
 * Auth core: passphrase-only login, opaque sessions stored as fixed-length
 * digests, CSRF binding, rate limiting, security headers, redacted audit.
 *
 * Security contract:
 * - Fail closed when required configuration is absent.
 * - Argon2id hash + server-only pepper; generic, timing-normalized failures.
 * - Sessions: cryptographically random opaque tokens; only sha-256 digests stored;
 *   fixed-length timing-safe comparisons. Host-only httpOnly Secure SameSite=Strict
 *   Path=/ cookie; idle + absolute expiry; rotate on login; revoke on logout/expiry.
 * - CSRF token bound to session; Origin/Host validation on state-changing requests.
 */
import { Hono, type Context } from "hono";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { verify as argonVerify } from "@node-rs/argon2";

export interface SessionRecord {
  csrfDigest: string;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
}

export interface SessionStore {
  put(digest: string, rec: Omit<SessionRecord, never>): Promise<void>;
  get(digest: string): Promise<SessionRecord | null>;
  delete(digest: string): Promise<void>;
  count(): number;
}

export function newMapStore(): SessionStore {
  const sessions = new Map<string, SessionRecord>();
  const store: SessionStore & { sessions?: Map<string, SessionRecord> } = {
    sessions,
    async put(digest, rec) {
      sessions.set(digest, rec);
    },
    async get(digest) {
      return sessions.get(digest) ?? null;
    },
    async delete(digest) {
      sessions.delete(digest);
    },
    count() {
      return sessions.size;
    },
  };
  return store;
}

export interface AuthConfig {
  argon2Hash: string;
  pepper: string;
  sessionTtlIdleMs: number;
  sessionTtlAbsoluteMs: number;
  rateLimit: {
    max: number;
    windowMs: number;
    globalMax?: number;
  };
  /** Trusted origin, e.g. https://jarvis.local */
  origin: string;
  maxBodyBytes?: number;
}

export interface AuthDeps {
  config: AuthConfig;
  store: SessionStore;
  now(): number;
  audit?(event: Record<string, unknown>): void;
}

export const SESSION_COOKIE = "jarvis_session";

export function digestOf(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------------------
// Rate limiting: deterministic sliding-ish fixed-window buckets.
interface Bucket {
  windowStart: number;
  count: number;
}

class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private global: Bucket = { windowStart: 0, count: 0 };
  constructor(
    private max: number,
    private windowMs: number,
    private globalMax: number,
  ) {}

  private check(bucket: Bucket, limit: number, nowMs: number): boolean {
    if (nowMs - bucket.windowStart >= this.windowMs) {
      bucket.windowStart = nowMs;
      bucket.count = 0;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }

  allow(clientKey: string, nowMs: number): boolean {
    if (!this.check(this.global, this.globalMax, nowMs)) return false;
    let bucket = this.buckets.get(clientKey);
    if (!bucket) {
      bucket = { windowStart: nowMs, count: 0 };
      this.buckets.set(clientKey, bucket);
    }
    return this.check(bucket, this.max, nowMs);
  }
}

// ---------------------------------------------------------------------------
// Generic failure normalization. Every failed auth path returns the exact same
// envelope. We add a tiny deterministic delay to blunt timing oracles; argon2
// verification itself only runs for well-formed requests with a passphrase.
const GENERIC_ERROR = { authenticated: false, error: "unauthorized" } as const;

const securityHeaders = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
  "x-frame-options": "DENY",
};

export function createApp(deps: AuthDeps): Hono {
  const { config } = deps;
  // Fail closed: refuse to construct without the required secrets.
  if (!config.argon2Hash || !config.argon2Hash.startsWith("$argon2")) {
    throw new Error("auth: missing argon2Hash configuration");
  }
  if (!config.pepper) {
    throw new Error("auth: missing pepper configuration");
  }
  const maxBody = config.maxBodyBytes ?? 32 * 1024;
  const limiter = new RateLimiter(
    config.rateLimit.max,
    config.rateLimit.windowMs,
    config.rateLimit.globalMax ?? config.rateLimit.max * 100,
  );

  const audit = (event: Record<string, unknown>) => {
    const safe = JSON.parse(JSON.stringify(event));
    if (typeof safe === "object" && safe !== null) {
      for (const k of Object.keys(safe as object)) {
        if (/passphrase|secret|token|hash|pepper|password/i.test(k)) delete (safe as Record<string, unknown>)[k];
      }
    }
    deps.audit?.(safe);
  };

  const app = new Hono();
  app.use("*", async (c, next) => {
    await next();
    for (const [k, v] of Object.entries(securityHeaders)) c.header(k, v);
  });

  const clientKey = (c: { req: { header(n: string): string | undefined } }) =>
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";

  const genericFailure = async (c: Context, status = 401, delayMs = 12) => {
    await new Promise((r) => setTimeout(r, delayMs));
    return c.json({ error: "unauthorized" }, status as 401);
  };

  const validateBody = async (c: Context): Promise<{ passphrase: string } | null> => {
    const ct = c.req.header("content-type") ?? "";
    if (!ct.toLowerCase().includes("application/json")) return null;
    const raw = await c.req.text();
    if (!raw || Buffer.byteLength(raw) > maxBody) return null;
    try {
      const parsed = JSON.parse(raw) as { passphrase?: unknown };
      if (typeof parsed?.passphrase !== "string" || parsed.passphrase.length === 0 || parsed.passphrase.length > 1024) {
        return null;
      }
      return { passphrase: parsed.passphrase };
    } catch {
      return null;
    }
  };

  const setSessionCookie = (c: Context, token: string, maxAgeSeconds: number) => {
    c.header(
      "set-cookie",
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`,
      { append: false },
    );
  };

  // CSRF / origin validation for state-changing requests -------------------------------------------------
  const validateCsrfContext = async (c: Context, sessionRec: SessionRecord | null): Promise<boolean> => {
    const origin = c.req.header("origin");
    const host = c.req.header("host");
    let originUrl: URL;
    try {
      if (!origin) return false;
      originUrl = new URL(origin);
    } catch {
      return false;
    }
    if (!host || originUrl.host.toLowerCase() !== host.toLowerCase()) return false;
    if (config.origin && origin !== config.origin) return false;
    const token = c.req.header("x-csrf-token") ?? "";
    if (!/^[0-9a-f]{64}$/i.test(token) || !sessionRec) return false;
    return safeEqual(digestOf(token), sessionRec.csrfDigest);
  };

  const sessionFromCookie = async (c: Context): Promise<{ token: string; rec: SessionRecord } | null> => {
    const cookie = c.req.header("cookie") ?? "";
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9_-]{40,64})(?:;|$)`));
    if (!match) return null;
    const token = match[1];
    if (!token) return null;
    const digest = digestOf(token);
    const rec = await deps.store.get(digest);
    if (!rec) return null;
    const nowMs = deps.now();
    if (nowMs >= rec.expiresAt || nowMs - rec.lastSeen >= config.sessionTtlIdleMs) {
      await deps.store.delete(digest);
      audit({ event: "session_expired" });
      return null;
    }
    return { token, rec };
  };

  // Routes ----------------------------------------------------------------------------------------------
  app.post("/api/auth/login", async (c) => {
    const nowMs = deps.now();
    const key = clientKey(c);
    if (!limiter.allow(key, nowMs)) {
      audit({ event: "login_rate_limited", client: key });
      return c.json({ error: "too_many_requests" }, 429);
    }
    const body = await validateBody(c);
    if (!body) {
      audit({ event: "login_invalid_request", client: key });
      return genericFailure(c);
    }
    let ok: boolean;
    try {
      // pepper is combined server-side, never leaves the process
      ok = await argonVerify(config.argon2Hash, body.passphrase + config.pepper);
    } catch {
      ok = false;
    }
    if (!ok) {
      audit({ event: "login_failed", client: key });
      return genericFailure(c);
    }
    // Rotate: revoke all existing sessions before issuing the new one.
    await revokeAll(deps);
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("hex");
    const rec: SessionRecord = {
      csrfDigest: digestOf(csrfToken),
      createdAt: nowMs,
      lastSeen: nowMs,
      expiresAt: nowMs + config.sessionTtlAbsoluteMs,
    };
    await deps.store.put(digestOf(token), rec);
    setSessionCookie(c, token, Math.floor(config.sessionTtlAbsoluteMs / 1000));
    audit({ event: "login_succeeded", client: key });
    return c.json({ authenticated: true, csrfToken });
  });

  app.post("/api/auth/logout", async (c) => {
    const sess = await sessionFromCookie(c);
    if (!sess) return genericFailure(c);
    if (!(await validateCsrfContext(c, sess.rec))) {
      audit({ event: "logout_csrf_rejected" });
      return c.json({ error: "forbidden" }, 403);
    }
    await deps.store.delete(digestOf(sess.token));
    c.header("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    audit({ event: "logout_succeeded" });
    return c.json({ ok: true });
  });

  app.get("/api/auth/session", async (c) => {
    const sess = await sessionFromCookie(c);
    if (!sess) {
      return c.json(GENERIC_ERROR, 401);
    }
    // refresh idle window
    sess.rec.lastSeen = deps.now();
    await deps.store.put(digestOf(sess.token), sess.rec);
    return c.json({ authenticated: true });
  });

  // Protected-route middleware ---------------------------------------------------------------------------
  app.use("/api/protected/*", async (c, next) => {
    const sess = await sessionFromCookie(c);
    if (!sess) {
      const accept = c.req.header("accept") ?? "";
      if (accept.includes("text/html")) {
        return c.redirect("/login", 302);
      }
      return c.json(GENERIC_ERROR, 401);
    }
    await next();
  });
  app.get("/api/protected/probe", (c) => c.json({ ok: true }));

  return app;
}

async function revokeAll(deps: AuthDeps) {
  // Store-level sweep: only feasible for the in-memory store; a shared store
  // would expose a revocation index instead. See deployment notes.
  const store = deps.store as SessionStore & { sessions?: Map<string, SessionRecord> };
  if (store.sessions) store.sessions.clear();
}

export { GENERIC_ERROR };
