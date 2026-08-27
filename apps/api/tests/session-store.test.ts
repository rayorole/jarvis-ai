import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSessionStore } from "../src/sessions/store";

describe("session store", () => {
  let store: ReturnType<typeof createSessionStore>;

  beforeEach(() => {
    store = createSessionStore();
  });

  it("creates a session with defaults and exposes a summary", () => {
    const s = store.create({ title: "Fix login bug" });
    expect(s.id).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(s.title).toBe("Fix login bug");
    expect(s.status).toBe("active");
    expect(s.messageCount).toBe(0);
    expect(s.messageCount).toBe(0);
    const listed = store.get(s.id);
    expect(listed?.id).toBe(s.id);
  });

  it("lists sessions newest-updated first", () => {
    vi.useFakeTimers();
    const a = store.create({ title: "older" });
    vi.advanceTimersByTime(10);
    const b = store.create({ title: "newer" });
    store.appendMessage(b.id, { role: "user", content: "hi" });
    vi.useRealTimers();
    const list = store.list({}).items;
    expect(list[0]?.id).toBe(b.id);
    expect(list.map((s) => s.id)).toContain(a.id);
  });

  it("renames and archives a session", () => {
    const s = store.create({ title: "draft" });
    const renamed = store.rename(s.id, "renamed title");
    expect(renamed.title).toBe("renamed title");
    const archived = store.setStatus(s.id, "archived");
    expect(archived.status).toBe("archived");
  });

  it("throws when mutating an unknown session", () => {
    expect(() => store.rename("missing", "x")).toThrow();
  });

  it("appends messages and returns canonical ordered history", () => {
    const s = store.create({ title: "t" });
    store.appendMessage(s.id, { role: "user", content: "first" });
    store.appendMessage(s.id, { role: "assistant", content: "second" });
    const detail = store.detail(s.id);
    expect(detail.messages.map((m) => m.content)).toEqual(["first", "second"]);
    expect(detail.messageCount).toBe(2);
  });

  it("paginates with a stable opaque cursor", () => {
    for (let i = 0; i < 7; i++) {
      store.create({ title: `session ${i}` });
    }
    const page1 = store.list({ limit: 3 });
    expect(page1.items).toHaveLength(3);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = store.list({ limit: 3, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(3);
    const all = [...page1.items, ...page2.items];
    expect(new Set(all.map((s) => s.id)).size).toBe(6);
    // stable: re-fetching page 1 gives the same ids
    const page1b = store.list({ limit: 3 });
    expect(page1b.items.map((s) => s.id)).toEqual(page1.items.map((s) => s.id));
  });

  it("returns a null nextCursor on the last page", () => {
    store.create({ title: "only" });
    const page = store.list({ limit: 10 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it("rejects an invalid cursor and tolerates a stale one", () => {
    expect(() => store.list({ cursor: "not-a-cursor" })).toThrow();
    for (let i = 0; i < 3; i++) store.create({ title: `s${i}` });
    const page = store.list({ limit: 1 });
    expect(page.nextCursor).not.toBeNull();
    // Anchor record deleted: the cursor is stale but must not crash.
    store.delete(page.items[0]!.id);
    expect(() => store.list({ cursor: page.nextCursor! })).not.toThrow();
  });

  it("full-text searches titles and message content", () => {
    const a = store.create({ title: "Kubernetes deploy debugging" });
    const b = store.create({ title: "grocery list" });
    store.appendMessage(b.id, { role: "user", content: "how do I fix the kubernetes ingress?" });
    const byTitle = store.search({ query: "kubernetes" });
    expect(byTitle.map((s) => s.id)).toContain(a.id);
    const byContent = store.search({ query: "ingress" });
    expect(byContent.map((s) => s.id)).toContain(b.id);
    expect(byContent.map((s) => s.id)).not.toContain(a.id);
  });

  it("search is case-insensitive and handles no results", () => {
    store.create({ title: "Mixed Case Topic" });
    expect(store.search({ query: "mixed case" })).toHaveLength(1);
    expect(store.search({ query: "zzz-no-match" })).toEqual([]);
  });

  it("resumes an incomplete session (run state) and records lineage", () => {
    const parent = store.create({ title: "parent" });
    const child = store.branch(parent.id, "msg-1");
    expect(child.parentSessionId).toBe(parent.id);
    expect(store.detail(parent.id).children.map((c) => c.id)).toContain(child.id);
    // incomplete sessions are resumable
    store.markRunState(parent.id, "running");
    expect(store.detail(parent.id).runState).toBe("running");
    expect(store.detail(parent.id).resumable).toBe(true);
    store.markRunState(parent.id, "failed");
    expect(store.detail(parent.id).resumable).toBe(true);
  });

  it("does not offer resume for completed sessions", () => {
    const s = store.create({ title: "done" });
    store.markRunState(s.id, "completed");
    expect(store.detail(s.id).resumable).toBe(false);
  });

  it("deletes a session and its lineage references", () => {
    const parent = store.create({ title: "p" });
    const child = store.branch(parent.id, "m1");
    store.delete(parent.id);
    expect(store.get(parent.id)).toBeUndefined();
    // child survives but parent linkage is cleared
    expect(store.get(child.id)).toBeDefined();
    expect(store.detail(child.id).parentSessionId).toBeUndefined();
  });

  it("normalizes malformed records defensively on read", () => {
    const s = store.create({ title: "x" });
    // corrupt internal record via a bad direct create
    const bad = store as unknown as { records: Map<string, Record<string, unknown>> };
    bad.records.get(s.id)!.messageCount = -5;
    expect(store.get(s.id)?.messageCount).toBe(0);
  });
});
