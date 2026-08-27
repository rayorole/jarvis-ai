import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/server";

/**
 * The sessions REST seam is mounted by createApp with a shared in-memory
 * store. Since createApp() builds a fresh store per call, each test boots
 * its own app.
 */
function boot() {
  return createApp();
}

async function createSession(app: ReturnType<typeof createApp>, title: string) {
  const res = await app.request("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; title: string; resumable: boolean };
}

describe("sessions REST endpoints", () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    app = boot();
  });

  it("creates a session", async () => {
    const res = await app.request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "My new session", model: "gpt-x", provider: "openai" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ title: "My new session", status: "active", runState: "idle", resumable: true });
  });

  it("rejects a malformed create body", async () => {
    const res = await app.request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: 42 }),
    });
    expect(res.status).toBe(400);
  });

  it("lists sessions with cursor pagination", async () => {
    for (let i = 0; i < 5; i++) await createSession(app, `session ${i}`);
    const page1 = (await (await app.request("/api/sessions?limit=2")).json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = (await (await app.request(`/api/sessions?limit=2&cursor=${encodeURIComponent(page1.nextCursor!)}`)).json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(page2.items).toHaveLength(2);
    expect(new Set([...page1.items, ...page2.items].map((s) => s.id)).size).toBe(4);
  });

  it("rejects an invalid cursor with 400", async () => {
    const res = await app.request("/api/sessions?cursor=@@@bad@@@");
    expect(res.status).toBe(400);
  });

  it("returns session detail with canonical ordered history", async () => {
    const s = await createSession(app, "history check");
    await app.request(`/api/sessions/${s.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "user", content: "first question" }),
    });
    await app.request(`/api/sessions/${s.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "assistant", content: "first answer" }),
    });
    const res = await app.request(`/api/sessions/${s.id}`);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as { messages: Array<{ content: string }>; messageCount: number };
    expect(detail.messages.map((m) => m.content)).toEqual(["first question", "first answer"]);
    expect(detail.messageCount).toBe(2);
  });

  it("404s on unknown session", async () => {
    const res = await app.request("/api/sessions/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("renames via PATCH", async () => {
    const s = await createSession(app, "before");
    const res = await app.request(`/api/sessions/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "after" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { title: string }).title).toBe("after");
  });

  it("archives and deletes", async () => {
    const s = await createSession(app, "temp");
    const archived = await app.request(`/api/sessions/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    expect(((await archived.json()) as { status: string }).status).toBe("archived");
    const del = await app.request(`/api/sessions/${s.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect((await app.request(`/api/sessions/${s.id}`)).status).toBe(404);
  });

  it("searches full text via ?q=", async () => {
    const a = await createSession(app, "terraform state repair");
    await createSession(app, "unrelated");
    const res = await app.request("/api/sessions?q=terraform");
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.map((i) => i.id)).toEqual([a.id]);
  });

  it("resume returns the session marked resumable with lineage", async () => {
    const parent = await createSession(app, "parent");
    const branch = await app.request(`/api/sessions/${parent.id}/branch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromMessageId: "m-1" }),
    });
    expect(branch.status).toBe(201);
    const child = (await branch.json()) as { id: string; parentSessionId: string };
    expect(child.parentSessionId).toBe(parent.id);
    const detail = (await (await app.request(`/api/sessions/${parent.id}`)).json()) as {
      children: Array<{ id: string }>;
    };
    expect(detail.children.map((c) => c.id)).toContain(child.id);
  });

  it("marks run state honestly (interrupted => resumable, completed => not)", async () => {
    const s = await createSession(app, "runs");
    await app.request(`/api/sessions/${s.id}/run-state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runState: "failed" }),
    });
    const failed = (await (await app.request(`/api/sessions/${s.id}`)).json()) as { runState: string; resumable: boolean };
    expect(failed.runState).toBe("failed");
    expect(failed.resumable).toBe(true);
    await app.request(`/api/sessions/${s.id}/run-state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runState: "completed" }),
    });
    const done = (await (await app.request(`/api/sessions/${s.id}`)).json()) as { resumable: boolean };
    expect(done.resumable).toBe(false);
  });
});
