import { describe, expect, it } from "vitest";
import { normalizeUsageSnapshot, type UsageSnapshot } from "@/lib/usage-api";

function rawSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-08-27T12:00:00.000Z",
    totals: { inputTokens: 1200, outputTokens: 340, costUsd: 0.42 },
    sessions: [
      {
        id: "s1",
        label: "Planner session",
        inputTokens: 800,
        outputTokens: 200,
        costUsd: 0.3,
        messages: 12,
      },
      {
        id: "s2",
        label: "Coder session",
        inputTokens: 400,
        outputTokens: 140,
        costUsd: 0.12,
        messages: 5,
      },
    ],
    ...overrides,
  };
}

describe("normalizeUsageSnapshot", () => {
  it("normalizes a well-formed payload", () => {
    const snap = normalizeUsageSnapshot(rawSnapshot());
    expect(snap.totals.inputTokens).toBe(1200);
    expect(snap.totals.costUsd).toBeCloseTo(0.42);
    expect(snap.sessions).toHaveLength(2);
    expect(snap.sessions[0]!.label).toBe("Planner session");
    expect(snap.generatedAt).toBe("2026-08-27T12:00:00.000Z");
  });

  it("degrades malformed payloads to a canonical empty snapshot without throwing", () => {
    const snap = normalizeUsageSnapshot({ totals: null, sessions: "nope" });
    expect(snap.totals.inputTokens).toBe(0);
    expect(snap.totals.outputTokens).toBe(0);
    expect(snap.totals.costUsd).toBe(0);
    expect(snap.sessions).toEqual([]);
    expect(snap.generatedAt).toBe("");
  });

  it("maps non-finite and negative numbers to safe values", () => {
    const snap = normalizeUsageSnapshot(
      rawSnapshot({
        totals: { inputTokens: -5, outputTokens: Number.NaN, costUsd: Infinity },
      }),
    );
    expect(snap.totals.inputTokens).toBe(0);
    expect(snap.totals.outputTokens).toBe(0);
    expect(snap.totals.costUsd).toBe(0);
  });

  it("clamps session fields individually and keeps unknown labels empty", () => {
    const snap = normalizeUsageSnapshot(
      rawSnapshot({
        sessions: [{ id: "s9", label: 42, inputTokens: "9", costUsd: -1, messages: null }],
      }),
    );
    expect(snap.sessions).toHaveLength(1);
    expect(snap.sessions[0]!.id).toBe("s9");
    expect(snap.sessions[0]!.label).toBe("");
    expect(snap.sessions[0]!.inputTokens).toBe(0);
    expect(snap.sessions[0]!.costUsd).toBe(0);
    expect(snap.sessions[0]!.messages).toBe(0);
  });

  it("is a pure type-level contract usable by callers", () => {
    const snap: UsageSnapshot = normalizeUsageSnapshot(rawSnapshot());
    expect(snap.totals.outputTokens).toBe(340);
  });
});
