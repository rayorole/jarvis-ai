import { describe, expect, it } from "vitest";
import { normalizeSession, normalizeMessage } from "../src/gateway/normalize.js";

describe("normalizeSession", () => {
  it("normalizes a well-formed upstream payload", () => {
    const out = normalizeSession({
      id: "s1",
      title: "Chat",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: 1767225600,
      model: "gpt",
      provider: "openrouter",
      status: "active",
      messageCount: 4,
    });
    expect(out.id).toBe("s1");
    expect(out.status).toBe("active");
    expect(out.updatedAt).toMatch(/2026-01-01T00:00:00/);
    expect(out.messageCount).toBe(4);
  });

  it("maps unknown statuses and missing fields to safe defaults", () => {
    const out = normalizeSession({ id: "s2" });
    expect(out.status).toBe("unknown");
    expect(out.title).toBe("");
    expect(out.messageCount).toBe(0);
  });

  it("throws on non-object payloads", () => {
    expect(() => normalizeSession("nope")).toThrow();
    expect(() => normalizeSession(null)).toThrow();
  });

  it("throws when the id is missing", () => {
    expect(() => normalizeSession({ title: "x" })).toThrow(/required string/);
  });
});

describe("normalizeMessage", () => {
  it("flattens content-part arrays into text", () => {
    const out = normalizeMessage("s1", {
      id: "m1",
      role: "assistant",
      content: [{ type: "text", text: "hello " }, { type: "text", text: "world" }],
      timestamp: 1767225600,
    });
    expect(out.content).toBe("hello world");
    expect(out.sessionId).toBe("s1");
    expect(out.role).toBe("assistant");
  });

  it("coerces unknown roles to system", () => {
    const out = normalizeMessage("s1", { id: "m2", role: "weird", content: "x" });
    expect(out.role).toBe("system");
  });
});
