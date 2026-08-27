import { describe, expect, it } from "vitest";
import {
  formatSchedule,
  normalizeIncident,
  normalizeJob,
  normalizeProcess,
  normalizeRun,
  redactSummary,
} from "@/lib/jobs";

describe("redactSummary", () => {
  it("redacts token-like strings and emails", () => {
    const out = redactSummary("ghp_abc123 sent to ops@example.com with api_key: sk-xyz");
    expect(out).not.toContain("ghp_abc123");
    expect(out).not.toContain("ops@example.com");
    expect(out).not.toContain("sk-xyz");
    expect(out).toContain("[redacted]");
  });

  it("truncates long summaries with an ellipsis", () => {
    const out = redactSummary("a".repeat(300), 120);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns empty string for non-strings", () => {
    expect(redactSummary(undefined)).toBe("");
    expect(redactSummary(42)).toBe("");
  });
});

describe("normalizeJob", () => {
  it("normalizes a full upstream payload", () => {
    const job = normalizeJob({
      id: "j1",
      name: "Nightly digest",
      schedule: "0 9 * * *",
      timezone: "Europe/Oslo",
      enabled: false,
      state: "blocked",
      blockedReason: "credential token: abc",
      nextRunAt: 1_700_000_000,
      failureStreak: 3,
      model: "claude-x",
      provider: "anthropic",
      deliveryTarget: "webhook https://hook/with/secret_token=zzz",
    });
    expect(job.state).toBe("blocked");
    expect(job.enabled).toBe(false);
    expect(job.timezone).toBe("Europe/Oslo");
    expect(job.nextRunAt.startsWith("2023-11-14")).toBe(true);
    expect(job.failureStreak).toBe(3);
    expect(job.blockedReason).toContain("[redacted]");
    expect(job.deliveryTarget).toContain("[redacted]");
  });

  it("maps unknown states to 'unknown' instead of guessing", () => {
    expect(normalizeJob({ id: "j2", state: "weird" }).state).toBe("unknown");
  });

  it("falls back to the raw schedule when no label is provided", () => {
    expect(normalizeJob({ id: "j3", schedule: "*/5 * * * *" }).scheduleLabel).toBe("*/5 * * * *");
  });

  it("throws when the id is missing", () => {
    expect(() => normalizeJob({ state: "queued" })).toThrow();
    expect(() => normalizeJob("not an object")).toThrow();
  });

  it("coerces hostile optional fields safely", () => {
    const job = normalizeJob({ id: "j4", enabled: "yes", failureStreak: -5, nextRunAt: "not-a-date" });
    expect(job.enabled).toBe(true);
    expect(job.failureStreak).toBe(0);
    expect(job.model).toBe("unknown");
  });
});

describe("normalizeRun", () => {
  it("normalizes usage, cost and states", () => {
    const run = normalizeRun({
      id: "r1",
      jobId: "j1",
      state: "succeeded",
      usage: { inputTokens: 100, outputTokens: 20 },
      costUsd: 0.0123,
      continuable: true,
      output: "Bearer abcdef done",
      deliveryResult: "delivered to email",
    });
    expect(run.state).toBe("succeeded");
    expect(run.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    expect(run.costUsd).toBeCloseTo(0.0123);
    expect(run.continuable).toBe(true);
    expect(run.output).toContain("[redacted]");
  });

  it("coerces missing usage and cost to safe zeros", () => {
    const run = normalizeRun({ id: "r2", state: "failed", error: "secret api_key: zzz" });
    expect(run.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(run.costUsd).toBe(0);
    expect(run.error).toContain("[redacted]");
    expect(run.continuable).toBe(false);
  });

  it("throws when id is missing", () => {
    expect(() => normalizeRun(null)).toThrow();
  });
});

describe("normalizeIncident", () => {
  it("normalizes severity and acknowledgement", () => {
    const inc = normalizeIncident({ id: "i1", title: "Job failed 3x", severity: "critical", acknowledged: true, jobId: "j1" });
    expect(inc.severity).toBe("critical");
    expect(inc.acknowledged).toBe(true);
    expect(inc.jobId).toBe("j1");
  });

  it("defaults unknown severity to info", () => {
    expect(normalizeIncident({ id: "i2" }).severity).toBe("info");
  });
});

describe("normalizeProcess", () => {
  it("normalizes process fields and redacts script summaries", () => {
    const p = normalizeProcess({ id: "p1", name: "watcher", pid: 4242.7, state: "running", script: "token: abc" });
    expect(p.pid).toBe(4242);
    expect(p.state).toBe("running");
    expect(p.summary).toContain("[redacted]");
  });

  it("maps unknown process states", () => {
    expect(normalizeProcess({ id: "p2", state: "zombie" }).state).toBe("unknown");
  });
});

describe("formatSchedule", () => {
  it("formats canonical schedule with timezone", () => {
    expect(formatSchedule("0 9 * * *", "UTC")).toBe("0 9 * * * (UTC)");
  });

  it("reports unscheduled jobs", () => {
    expect(formatSchedule("", "Europe/Oslo")).toBe("unscheduled (Europe/Oslo)");
  });
});
