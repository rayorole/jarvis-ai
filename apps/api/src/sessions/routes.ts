/**
 * Sessions REST endpoints (`/api/sessions*`) over the in-memory session
 * store. This is Jarvis's own session seam — distinct from the gateway proxy
 * allowlist, which forwards browser traffic to the fixed upstream origin.
 */
import { Hono } from "hono";
import { z } from "zod";
import { createSessionStore, type SessionStore } from "./store.js";

const createBody = z.object({
  title: z.string().max(200).optional(),
  model: z.string().max(100).optional(),
  provider: z.string().max(100).optional(),
  parentSessionId: z.string().max(128).optional(),
});

const patchBody = z
  .object({
    title: z.string().max(200).optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((v) => v.title !== undefined || v.status !== undefined, {
    message: "nothing to update",
  });

const messageBody = z.object({
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string().max(256 * 1024),
});

const runStateBody = z.object({
  runState: z.enum(["idle", "running", "completed", "failed", "cancelled"]),
});

const branchBody = z.object({
  fromMessageId: z.string().min(1).max(128),
});

export interface SessionsApi {
  store: SessionStore;
  routes: Hono;
}

export function createSessionsApi(store: SessionStore = createSessionStore()): SessionsApi {
  const routes = new Hono();

  routes.post("/", async (c) => {
    const parsed = createBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid request body" }, 400);
    return c.json(store.create(parsed.data), 201);
  });

  routes.get("/", (c) => {
    const q = c.req.query("q");
    if (q !== undefined) {
      return c.json({ items: store.search({ query: q, limit: parseLimit(c.req.query("limit")) }) });
    }
    const limit = parseLimit(c.req.query("limit"));
    try {
      return c.json(store.list({ limit, cursor: c.req.query("cursor") }));
    } catch {
      return c.json({ error: "invalid cursor" }, 400);
    }
  });

  routes.get("/:id", (c) => {
    const detail = store.get(c.req.param("id"));
    if (detail === undefined) return c.json({ error: "session not found" }, 404);
    return c.json(store.detail(c.req.param("id")));
  });

  routes.patch("/:id", async (c) => {
    const parsed = patchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid request body" }, 400);
    try {
      let summary = store.get(c.req.param("id"));
      if (summary === undefined) return c.json({ error: "session not found" }, 404);
      if (parsed.data.title !== undefined) summary = store.rename(c.req.param("id"), parsed.data.title);
      if (parsed.data.status !== undefined) summary = store.setStatus(c.req.param("id"), parsed.data.status);
      return c.json(summary);
    } catch {
      return c.json({ error: "session not found" }, 404);
    }
  });

  routes.delete("/:id", (c) => {
    try {
      store.delete(c.req.param("id"));
      return c.body(null, 204);
    } catch {
      return c.json({ error: "session not found" }, 404);
    }
  });

  routes.post("/:id/messages", async (c) => {
    const parsed = messageBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid request body" }, 400);
    try {
      return c.json(store.appendMessage(c.req.param("id"), parsed.data as { role: "user" | "assistant" | "tool" | "system"; content: string }), 201);
    } catch {
      return c.json({ error: "session not found" }, 404);
    }
  });

  routes.post("/:id/run-state", async (c) => {
    const parsed = runStateBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid request body" }, 400);
    try {
      return c.json(store.markRunState(c.req.param("id"), parsed.data.runState));
    } catch {
      return c.json({ error: "session not found" }, 404);
    }
  });

  routes.post("/:id/branch", async (c) => {
    const parsed = branchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid request body" }, 400);
    try {
      return c.json(store.branch(c.req.param("id"), parsed.data.fromMessageId), 201);
    } catch {
      return c.json({ error: "session not found" }, 404);
    }
  });

  return { store, routes };
}

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 100 ? n : undefined;
}
