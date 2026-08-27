import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomBytes, createHash } from "node:crypto";
import { hash as argonHash } from "@node-rs/argon2";
import { createApp, newMapStore, type AuthDeps, type SessionStore } from "../src/auth/index.js";
import { startTestServer } from "./helpers/server.js";

const PASSPHRASE = "correct horse battery staple";
const PEPPER = "test-pepper-not-a-secret";
const ORIGIN = "https://jarvis.local";

async function makeDeps(overrides: Partial<AuthDeps> = {}): Promise<AuthDeps> {
  const argon2Hash = await argonHash(PASSPHRASE + PEPPER);
  return {
    config: {
      argon2Hash,
      pepper: PEPPER,
      sessionTtlIdleMs: 30 * 60 * 1000,
      sessionTtlAbsoluteMs: 12 * 60 * 60 * 1000,
      rateLimit: { max: 5, windowMs: 60_000 },
      origin: ORIGIN,
    },
    store: newMapStore(),
    now: () => Date.now(),
    ...overrides,
  };
}

function tokenFrom(setCookie: string[]): string {
  const c = setCookie.find((x) => x.startsWith("jarvis_session="));
  if (!c) throw new Error("no session cookie present");
  return c.split(";")[0]!.split("=").slice(1).join("=");
}

function cookieHeader(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

interface ServerHandle {
  base: string;
  close(): Promise<void>;
}
let server: ServerHandle;
let agentBase: string;

beforeAll(async () => {
  const app = createApp(await makeDeps());
  server = await startTestServer(app);
  agentBase = server.base;
});

afterAll(async () => {
  await server.close();
});

function post(base: string, path: string) {
  return request(base).post(path);
}
function get(base: string, path: string) {
  return request(base).get(path);
}

describe("auth configuration fail-closed", () => {
  it("refuses to construct when pepper is missing", async () => {
    const d = await makeDeps();
    expect(() => createApp({ ...d, config: { ...d.config, pepper: "" } })).toThrow();
  });

  it("refuses to construct when hash is missing", async () => {
    const d = await makeDeps();
    expect(() => createApp({ ...d, config: { ...d.config, argon2Hash: "" } })).toThrow();
  });
});

describe("POST /api/auth/login", () => {
  let base: string;
  let handle: ServerHandle;
  beforeAll(async () => {
    const app = createApp(await makeDeps());
    handle = await startTestServer(app);
    base = handle.base;
  });
  afterAll(async () => {
    await handle.close();
  });
  it("sets a secure host-only httpOnly session cookie on valid login", async () => {
    const res = await post(base, "/api/auth/login").send({ passphrase: PASSPHRASE });
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const session = cookies.find((c) => c.startsWith("jarvis_session="))!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Secure/i);
    expect(session).toMatch(/SameSite=Strict/i);
    expect(session).toMatch(/Path=\//i);
    expect(session).not.toMatch(/Domain=/i); // host-only
  });

  it("returns a CSRF token bound to the session", async () => {
    const res = await post(base, "/api/auth/login").send({ passphrase: PASSPHRASE });
    expect(typeof res.body.csrfToken).toBe("string");
    expect(res.body.csrfToken.length).toBe(64);
  });

  // Fresh server per test: each test makes multiple login attempts, which would
  // otherwise trip the per-client rate limiter shared across the describe block.
  async function freshLoginServer() {
    const app = createApp(await makeDeps());
    return startTestServer(app);
  }

  it("rejects wrong passphrase with generic error and no cookie", async () => {
    const srv = await freshLoginServer();
    try {
      const res = await post(srv.base, "/api/auth/login").send({ passphrase: "wrong" });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "unauthorized" });
      expect(res.headers["set-cookie"]).toBeUndefined();
    } finally {
      await srv.close();
    }
  });

  it("returns identical body/status for malformed input and wrong passphrase (generic failures)", async () => {
    const srv = await freshLoginServer();
    try {
      const badJson = await request(srv.base)
        .post("/api/auth/login")
        .set("content-type", "application/json")
        .send("{oops");
      const wrongPw = await request(srv.base).post("/api/auth/login").send({ passphrase: "nope" });
      const missing = await request(srv.base).post("/api/auth/login").send({});
      expect(badJson.status).toBe(wrongPw.status);
      expect(badJson.body).toEqual(wrongPw.body);
      expect(missing.body).toEqual(wrongPw.body);
      expect(missing.status).toBe(wrongPw.status);
    } finally {
      await srv.close();
    }
  });

  it("rejects oversized bodies with the same generic envelope", async () => {
    const srv = await freshLoginServer();
    try {
      const huge = await request(srv.base).post("/api/auth/login").send({ passphrase: "x".repeat(200_000) });
      expect(huge.status).toBe(401);
      expect(huge.body).toEqual({ error: "unauthorized" });
    } finally {
      await srv.close();
    }
  });

  it("rejects non-JSON content types generically", async () => {
    const srv = await freshLoginServer();
    try {
      const res = await request(srv.base)
        .post("/api/auth/login")
        .set("content-type", "text/plain")
        .send(PASSPHRASE);
      expect([400, 401, 415]).toContain(res.status);
    } finally {
      await srv.close();
    }
  });

  it("enforces per-client rate limiting at threshold/cooldown/reset boundaries deterministically", async () => {
    const deps = await makeDeps();
    const app = createApp(deps);
    const srv = await startTestServer(app);
    try {
      let t = 1_000_000;
      deps.now = () => t;
      const post = () =>
        request(srv.base).post("/api/auth/login").set("x-forwarded-for", "203.0.113.9").send({ passphrase: "bad" });

      // threshold: max allowed, then blocked
      for (let i = 0; i < deps.config.rateLimit.max; i++) {
        expect((await post()).status).toBe(401);
      }
      expect((await post()).status).toBe(429);

      // cooldown boundary: just before window expiry still blocked
      t += deps.config.rateLimit.windowMs - 1;
      expect((await post()).status).toBe(429);

      // reset boundary: at window expiry allow again
      t += 1;
      expect((await post()).status).toBe(401);
    } finally {
      await srv.close();
    }
  });

  it("rate limits globally and independently of per-client buckets", async () => {
    const deps = await makeDeps();
    deps.config.rateLimit.globalMax = 3;
    const app = createApp(deps);
    const srv = await startTestServer(app);
    try {
      const t = 500_000;
      deps.now = () => t;
      const ips = ["1.1.1.1", "2.2.2.2", "3.3.3.3"] as const;
      const send = (i: number) =>
        request(srv.base).post("/api/auth/login").set("x-forwarded-for", ips[i % 3] as string).send({ passphrase: "bad" });
      expect((await send(0)).status).toBe(401);
      expect((await send(1)).status).toBe(401);
      expect((await send(2)).status).toBe(401);
      expect((await send(0)).status).toBe(429); // global cap hit
    } finally {
      await srv.close();
    }
  });
});

describe("session lifecycle", () => {
  async function login(base: string) {
    const res = await request(base).post("/api/auth/login").send({ passphrase: PASSPHRASE });
    return {
      csrf: res.body.csrfToken as string,
      cookie: cookieHeader(res),
      setCookie: res.headers["set-cookie"] as unknown as string[],
    };
  }

  it("stores only a fixed-length digest, never the raw token", async () => {
    const deps = await makeDeps();
    const app = createApp(deps);
    const srv = await startTestServer(app);
    try {
      const l = await login(srv.base);
      const token = tokenFrom(l.setCookie);
      expect(token.length).toBeGreaterThanOrEqual(32);
      const store = deps.store as SessionStore & { sessions?: Map<string, unknown> };
      for (const key of store.sessions!.keys()) {
        expect(key).not.toBe(token);
        expect(key.length).toBe(64); // sha-256 hex
        expect(key).toBe(createHash("sha256").update(token).digest("hex"));
      }
    } finally {
      await srv.close();
    }
  });

  it("GET /api/auth/session returns authenticated envelope with valid cookie", async () => {
    const app = createApp(await makeDeps());
    const srv = await startTestServer(app);
    try {
      const l = await login(srv.base);
      const res = await request(srv.base).get("/api/auth/session").set("cookie", l.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ authenticated: true });
    } finally {
      await srv.close();
    }
  });

  it("session-status returns stable unauthenticated envelope without cookie", async () => {
    const res = await get(agentBase, "/api/auth/session");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ authenticated: false, error: "unauthorized" });
  });

  it("rotates session on each login (old session revoked)", async () => {
    const app = createApp(await makeDeps());
    const srv = await startTestServer(app);
    try {
      const first = await login(srv.base);
      const second = await login(srv.base);
      expect(tokenFrom(first.setCookie)).not.toBe(tokenFrom(second.setCookie));
      const r1 = await request(srv.base).get("/api/auth/session").set("cookie", first.cookie);
      expect(r1.status).toBe(401);
      const r2 = await request(srv.base).get("/api/auth/session").set("cookie", second.cookie);
      expect(r2.status).toBe(200);
    } finally {
      await srv.close();
    }
  });

  it("rejects replay after logout", async () => {
    const app = createApp(await makeDeps());
    const srv = await startTestServer(app);
    try {
      const l = await login(srv.base);
      const logout = await request(srv.base)
        .post("/api/auth/logout")
        .set("cookie", l.cookie)
        .set("origin", ORIGIN)
        .set("host", new URL(ORIGIN).host)
        .set("x-csrf-token", l.csrf);
      expect(logout.status).toBe(200);
      const replay = await request(srv.base).get("/api/auth/session").set("cookie", l.cookie);
      expect(replay.status).toBe(401);
    } finally {
      await srv.close();
    }
  });

  it("logout clears the cookie", async () => {
    const app = createApp(await makeDeps());
    const srv = await startTestServer(app);
    try {
      const l = await login(srv.base);
      const res = await request(srv.base)
        .post("/api/auth/logout")
        .set("cookie", l.cookie)
        .set("origin", ORIGIN)
        .set("host", new URL(ORIGIN).host)
        .set("x-csrf-token", l.csrf);
      const cookies = res.headers["set-cookie"] as unknown as string[];
      const cleared = cookies.find((c) => c.startsWith("jarvis_session="));
      expect(cleared).toBeTruthy();
      expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    } finally {
      await srv.close();
    }
  });

  it("idle expiry rejects the session and revokes it", async () => {
    const deps = await makeDeps();
    const app = createApp(deps);
    const srv = await startTestServer(app);
    try {
      let t = 10_000_000;
      deps.now = () => t;
      const l = await login(srv.base);
      // login set lastSeen = t; advance past the idle window without refreshing
      t += deps.config.sessionTtlIdleMs;
      const expired = await request(srv.base).get("/api/auth/session").set("cookie", l.cookie);
      expect(expired.status).toBe(401);
      const store = deps.store as SessionStore & { sessions?: Map<string, unknown> };
      expect(store.sessions!.size).toBe(0);

      // idle refresh keeps a session alive
      const l2 = await login(srv.base);
      t += Math.floor(deps.config.sessionTtlIdleMs / 2);
      const ok = await request(srv.base).get("/api/auth/session").set("cookie", l2.cookie);
      expect(ok.status).toBe(200); // refreshes lastSeen to t
      t += deps.config.sessionTtlIdleMs - 1;
      const stillOk = await request(srv.base).get("/api/auth/session").set("cookie", l2.cookie);
      expect(stillOk.status).toBe(200);
    } finally {
      await srv.close();
    }
  });

  it("absolute expiry wins over idle refresh", async () => {
    const deps = await makeDeps();
    const app = createApp(deps);
    const srv = await startTestServer(app);
    try {
      const start = 20_000_000;
      let t = start;
      deps.now = () => t;
      const l = await login(srv.base);
      // refresh at half the idle window: each GET keeps idle expiry away,
      // but createdAt is fixed so absolute expiry must still fire.
      while (t < start + deps.config.sessionTtlAbsoluteMs - deps.config.sessionTtlIdleMs / 2) {
        t += Math.floor(deps.config.sessionTtlIdleMs / 2);
        const r = await request(srv.base).get("/api/auth/session").set("cookie", l.cookie);
        expect(r.status).toBe(200);
        t += 1; // avoid idling exactly at each probe
      }
      t = start + deps.config.sessionTtlAbsoluteMs;
      const dead = await request(srv.base).get("/api/auth/session").set("cookie", l.cookie);
      expect(dead.status).toBe(401);
    } finally {
      await srv.close();
    }
  });

  it("malformed / hostile cookies are rejected", async () => {
    const cases = [
      "jarvis_session=short",
      "jarvis_session=" + "z".repeat(64),
      "jarvis_session=%FF%FEgarbage",
      `jarvis_session=${randomBytes(32).toString("hex")}`, // unknown but well-formed
      "other_cookie=1",
    ];
    for (const cookie of cases) {
      const res = await get(agentBase, "/api/auth/session").set("cookie", cookie);
      expect(res.status).toBe(401);
    }
  });

  it("protected routes return a stable unauthenticated envelope for JSON clients and redirect browsers", async () => {
    const app = createApp(await makeDeps());
    const srv = await startTestServer(app);
    try {
      const jsonRes = await request(srv.base).get("/api/protected/probe").set("accept", "application/json");
      expect(jsonRes.status).toBe(401);
      expect(jsonRes.body).toEqual({ authenticated: false, error: "unauthorized" });

      const browserRes = await request(srv.base).get("/api/protected/probe").set("accept", "text/html");
      expect(browserRes.status).toBe(302);
      expect(browserRes.headers.location).toBe("/login");
    } finally {
      await srv.close();
    }
  });
});

describe("CSRF and origin/host validation", () => {
  async function setup() {
    const app = createApp(await makeDeps());
    const srv = await startTestServer(app);
    const res = await request(srv.base).post("/api/auth/login").send({ passphrase: PASSPHRASE });
    return { srv, csrf: res.body.csrfToken as string, cookie: cookieHeader(res) };
  }

  it("rejects state-changing requests without CSRF token", async () => {
    const { srv, cookie } = await setup();
    try {
      const res = await request(srv.base)
        .post("/api/auth/logout")
        .set("cookie", cookie)
        .set("origin", ORIGIN)
        .set("host", new URL(ORIGIN).host);
      expect(res.status).toBe(403);
    } finally {
      await srv.close();
    }
  });

  it("rejects mismatched CSRF token", async () => {
    const { srv, cookie } = await setup();
    try {
      const res = await request(srv.base)
        .post("/api/auth/logout")
        .set("cookie", cookie)
        .set("origin", ORIGIN)
        .set("host", new URL(ORIGIN).host)
        .set("x-csrf-token", "f".repeat(64));
      expect(res.status).toBe(403);
    } finally {
      await srv.close();
    }
  });

  it("rejects hostile Origin headers", async () => {
    const { srv, cookie, csrf } = await setup();
    try {
      const host = new URL(ORIGIN).host;
      for (const origin of ["https://evil.example", "http://jarvis.local.evil.com", null]) {
        const req = request(srv.base)
          .post("/api/auth/logout")
          .set("cookie", cookie)
          .set("host", host)
          .set("x-csrf-token", csrf);
        if (origin) req.set("origin", origin);
        const res = await req;
        expect([401, 403]).toContain(res.status);
      }
    } finally {
      await srv.close();
    }
  });

  it("rejects mismatched Host vs Origin", async () => {
    const { srv, cookie, csrf } = await setup();
    try {
      const res = await request(srv.base)
        .post("/api/auth/logout")
        .set("cookie", cookie)
        .set("origin", ORIGIN)
        .set("host", "evil.example")
        .set("x-csrf-token", csrf);
      expect(res.status).toBe(403);
    } finally {
      await srv.close();
    }
  });

  it("accepts matching origin/host with valid CSRF", async () => {
    const { srv, cookie, csrf } = await setup();
    try {
      const res = await request(srv.base)
        .post("/api/auth/logout")
        .set("cookie", cookie)
        .set("origin", ORIGIN)
        .set("host", new URL(ORIGIN).host)
        .set("x-csrf-token", csrf);
      expect(res.status).toBe(200);
    } finally {
      await srv.close();
    }
  });
});

describe("security headers and audit redaction", () => {
  it("applies security headers on auth responses", async () => {
    const res = await get(agentBase, "/api/auth/session");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("audit events never contain secrets or tokens", async () => {
    const logs: unknown[] = [];
    const audit = (event: Record<string, unknown>) => logs.push(event);
    const app = createApp({ ...(await makeDeps({ audit })), audit });
    const srv = await startTestServer(app);
    try {
      await request(srv.base).post("/api/auth/login").send({ passphrase: PASSPHRASE });
      await request(srv.base).post("/api/auth/login").send({ passphrase: "wrong-guess" });
    } finally {
      await srv.close();
    }
    const flat = JSON.stringify(logs);
    expect(flat).not.toContain(PASSPHRASE);
    expect(flat).not.toContain(PEPPER);
    expect(flat).not.toContain("$argon2");
  });
});
