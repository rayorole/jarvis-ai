/**
 * Approval card + pending-approvals hook tests (issue #9).
 *
 * Tests exercise public seams only: the rendered card and the useApprovals
 * hook, with the network boundary (fetch) mocked. Covers lifecycle and
 * decision states, idempotency/lock behavior, focus management,
 * sanitization, timeout, and retry-safe errors.
 */
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useState, type ReactNode } from "react";
import { ApprovalCard, isDestructive, isTerminal } from "../src/components/approvals/approval-card";
import { ToolCard, sanitizeToolText } from "../src/components/approvals/tool-card";
import { useApprovals } from "../src/lib/use-approvals";
import type { ApprovalRequest } from "../src/lib/approvals-api";

function request(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: "ap1",
    sessionId: "s1",
    runId: "r1",
    toolName: "write_file",
    explanation: "Jarvis wants to overwrite a file",
    riskCategory: "elevated",
    action: "write file",
    path: "/tmp/out.txt",
    expiresAt: "2026-08-27T13:00:00.000Z",
    status: "pending",
    supportedDecisions: ["deny", "approve-once"],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Mount a harness that renders pending approvals via useApprovals. */
function Harness(props: { fetchImpl: typeof fetch; pollMs?: number }): ReactNode {
  const { pending, pendingId, decide, isLoading } = useApprovals(props.fetchImpl, { pollMs: props.pollMs });
  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      {pending.map((r) => (
        <ApprovalCard key={r.id} request={r} decide={decide} pendingId={pendingId} />
      ))}
      <span data-testid="pending-ids">{pending.map((r) => r.id).join(",")}</span>
      <span data-testid="in-flight">{pendingId ?? ""}</span>
      <span data-testid="pending-count">{pending.length}</span>
    </div>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  let meta = document.querySelector('meta[name="csrf-token"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "csrf-token");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", "test-csrf");
});

afterEach(() => {
  cleanup();
});

describe("ApprovalCard rendering", () => {
  it("renders explanation, risk, sanitized action/path and expiry", () => {
    render(<ApprovalCard request={request()} />);
    expect(screen.getByTestId("approval-explanation-ap1").textContent).toBe("Jarvis wants to overwrite a file");
    expect(screen.getByTestId("approval-risk-ap1").textContent).toBe("elevated");
    expect(screen.getByTestId("approval-action-ap1").textContent).toBe("write file");
    expect(screen.getByTestId("approval-path-ap1").textContent).toContain("/tmp/out.txt");
    expect(screen.getByTestId("approval-expires-ap1").textContent).toContain("2026-08-27");
  });

  it("offers only gateway-supported decisions", () => {
    render(
      <ApprovalCard
        request={request({ supportedDecisions: ["deny", "approve-once"] })}
      />,
    );
    expect(screen.getByRole("button", { name: "Deny" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve once" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve for session" })).toBeNull();
  });

  it("gives default focus to Deny, never a destructive approval", () => {
    render(
      <ApprovalCard
        request={request({ riskCategory: "destructive", supportedDecisions: ["deny", "approve-once", "approve-for-session"] })}
      />,
    );
    expect(document.activeElement?.getAttribute("data-decision")).toBe("deny");
    expect(screen.getByTestId("approval-card-ap1").getAttribute("data-destructive")).toBe("true");
  });

  it("marks non-destructive cards as such", () => {
    render(<ApprovalCard request={request({ riskCategory: "safe" })} />);
    expect(screen.getByTestId("approval-card-ap1").getAttribute("data-destructive")).toBe("false");
  });

  it("renders an expired request as terminal and inert", () => {
    render(<ApprovalCard request={request({ status: "expired" })} />);
    expect(screen.getByTestId("approval-terminal-ap1").textContent).toBe("Expired");
    expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
  });

  it("isTerminal helper reflects status and resolution", () => {
    expect(isTerminal(request())).toBe(false);
    expect(isTerminal(request({ status: "expired" }))).toBe(true);
    expect(isTerminal(request(), { id: "ap1", decision: "deny" })).toBe(true);
  });

  it("isDestructive helper reflects the risk category", () => {
    expect(isDestructive(request({ riskCategory: "destructive" }))).toBe(true);
    expect(isDestructive(request({ riskCategory: "elevated" }))).toBe(false);
  });

  it("renders a no-decisions state when the gateway supports nothing", () => {
    render(<ApprovalCard request={request({ supportedDecisions: [] })} />);
    expect(screen.getByTestId("approval-no-decisions-ap1")).toBeTruthy();
  });
});

describe("ApprovalCard decisions", () => {
  it("sends a decision through the hook and locks to one accepted response", async () => {
    const user = userEvent.setup();
    const postBodies: Array<{ headers: Record<string, string>; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/approvals") && (init?.method ?? "GET") === "GET") {
        return jsonResponse({ items: [request()] });
      }
      if (u.endsWith("/decision") && init?.method === "POST") {
        const headers = Object.fromEntries(
          Object.entries(init.headers as Record<string, string>),
        ) as Record<string, string>;
        postBodies.push({ headers, body: JSON.parse(init.body as string) });
        return jsonResponse({ accepted: true });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;

    render(<Harness fetchImpl={fetchImpl} />);
    const denyButton = await screen.findByRole("button", { name: "Deny" });
    await user.click(denyButton);

    await waitFor(() => {
      expect(screen.getByTestId("pending-count").textContent).toBe("0");
    });
    // One-time idempotency key + CSRF present; body carries the decision.
    expect(postBodies).toHaveLength(1);
    expect(postBodies[0]!.headers["x-idempotency-key"]).toMatch(/^[0-9a-f]{32}$/);
    expect(postBodies[0]!.headers["x-csrf-token"]).toBe("test-csrf");
    expect(postBodies[0]!.body).toEqual({ decision: "deny" });
    expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
  });

  it("rejects a duplicate decision while one is in flight (client-side lock)", async () => {
    let releasePost: ((v: Response) => void) | undefined;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/approvals") && (init?.method ?? "GET") === "GET") {
        return jsonResponse({ items: [request()] });
      }
      if (u.endsWith("/decision")) {
        await new Promise<Response>((resolve) => {
          releasePost = resolve;
        });
        return jsonResponse({ accepted: true });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;

    function DecisionHarness(): ReactNode {
      const { pending, pendingId, decide } = useApprovals(fetchImpl);
      const [result, setResult] = useState<string>("");
      return (
        <div>
          {pending.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                void decide(r.id, "deny").then((x) =>
                  setResult((prev) => `${prev}deny:${String(x.accepted)};`),
                );
                void decide(r.id, "approve-once").then((x) =>
                  setResult((prev) => `${prev}approve-once:${String(x.accepted)};`),
                );
              }}
            >
              fire
            </button>
          ))}
          <span data-testid="in-flight">{pendingId ?? ""}</span>
          <span data-testid="result">{result}</span>
        </div>
      );
    }

    render(<DecisionHarness />);
    await screen.findByTestId("in-flight");
    await userEvent.setup().click(screen.getByRole("button", { name: "fire" }));
    await waitFor(() => {
      // The second (approve-once) call is rejected client-side while the
      // first (deny) is still in flight: duplicate lock fires immediately.
      expect(screen.getByTestId("result").textContent).toBe("approve-once:false;");
    });
    // Release the in-flight promise to avoid dangling handles.
    act(() => releasePost?.(jsonResponse({ accepted: true })));
  });

  it("marks resolution only from the mutation response, not optimistically", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/approvals") && (init?.method ?? "GET") === "GET") {
        return jsonResponse({ items: [request()] });
      }
      if (u.endsWith("/decision")) {
        return jsonResponse({ accepted: false, reason: "stale" }, 200);
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;

    function RejectionHarness(): ReactNode {
      const { pending, decide } = useApprovals(fetchImpl);
      const [resolved, setResolved] = useState<string | null>(null);
      return (
        <div>
          {pending.map((r) => (
            <div key={r.id}>
              <button
                type="button"
                onClick={() => {
                  void decide(r.id, "approve-once").then((res) => {
                    // Only the mutation response may mark resolution.
                    if (res.accepted) setResolved(r.id);
                  });
                }}
              >
                decide
              </button>
              {resolved ? <span data-testid="resolved">{resolved}</span> : null}
            </div>
          ))}
        </div>
      );
    }

    render(<RejectionHarness />);
    await screen.findByRole("button", { name: "decide" });
    await user.click(screen.getByRole("button", { name: "decide" }));
    await waitFor(() => {
      // Rejected: request stays pending, nothing is resolved.
      expect(screen.getByRole("button", { name: "decide" })).toBeTruthy();
    });
    expect(screen.queryByTestId("resolved")).toBeNull();
  });

  it("fails closed on network error and keeps the card actionable", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/approvals") && (init?.method ?? "GET") === "GET") {
        return jsonResponse({ items: [request()] });
      }
      throw new TypeError("network down");
    }) as unknown as typeof fetch;

    render(<Harness fetchImpl={fetchImpl} />);
    const denyButton = await screen.findByRole("button", { name: "Deny" });
    await user.click(denyButton);
    await waitFor(() => {
      expect(screen.getByTestId("pending-count").textContent).toBe("1");
    });
    // Still actionable after the failure (retry-safe), not resolved.
    expect((screen.getByRole("button", { name: "Deny" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ignores a malformed pending payload (fails closed to empty list)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [{ id: 42 }, "nope", null] })) as unknown as typeof fetch;
    render(<Harness fetchImpl={fetchImpl} />);
    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("pending-count").textContent).toBe("0");
  });

  it("surfaces an offline/refresh error while retaining last-known state", async () => {
    let fail = false;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/approvals") && (init?.method ?? "GET") === "GET") {
        if (fail) throw new TypeError("offline");
        return jsonResponse({ items: [request()] });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;

    function RefreshHarness(): ReactNode {
      const { pending, refresh, error } = useApprovals(fetchImpl);
      return (
        <div>
          <span data-testid="count">{pending.length}</span>
          <span data-testid="error">{error ? error.message : ""}</span>
          <button type="button" onClick={refresh}>
            refresh
          </button>
        </div>
      );
    }

    render(<RefreshHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("1");
    });
    fail = true;
    await userEvent.setup().click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).not.toBe("");
    });
    // Last-known pending list is retained (fail-closed, understandable).
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("polls on the configured interval", async () => {
    vi.useFakeTimers();
    try {
      const mockFn = vi.fn(async () => jsonResponse({ items: [] }));
      const fetchImpl = mockFn as unknown as typeof fetch;
      render(<Harness fetchImpl={fetchImpl} pollMs={50} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      const afterInitial = mockFn.mock.calls.length;
      expect(afterInitial).toBeGreaterThanOrEqual(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      expect(mockFn.mock.calls.length).toBeGreaterThan(afterInitial);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("sanitization", () => {
  it("strips control characters from rendered tool text", () => {
    expect(sanitizeToolText("run\u0000rm -rf\u001b[31m /")).toBe("runrm -rf[31m /");
  });

  it("renders hostile tool name as inert text, never markup", () => {
    render(<ToolCard toolCallId="t1" toolName="<img src=x onerror=alert(1)>" state="completed" />);
    const nameEl = screen.getByTestId("tool-name-t1");
    expect(nameEl.querySelector("img")).toBeNull();
    expect(nameEl.textContent).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("ToolCard lifecycle", () => {
  it("renders each lifecycle state deterministically", () => {
    const states = ["queued", "running", "completed", "failed", "cancelled"] as const;
    for (const state of states) {
      render(<ToolCard toolCallId="t1" toolName="run_cmd" state={state} />);
      expect(screen.getByTestId("tool-state-t1").getAttribute("data-state")).toBe(state);
      expect(screen.getByTestId("tool-state-t1").textContent.toLowerCase()).toBe(state);
      cleanup();
    }
  });

  it("shows bounded output preview and artifacts only when expanded", async () => {
    const user = userEvent.setup();
    render(
      <ToolCard
        toolCallId="t2"
        toolName="run_cmd"
        args="--flag value"
        state="completed"
        elapsedLabel="3s"
        outputPreview="line one\nline two"
        artifacts={["out/log.txt"]}
      />,
    );
    expect(screen.queryByTestId("tool-output-t2")).toBeNull();
    await user.click(screen.getByTestId("tool-expand-t2"));
    expect(screen.getByTestId("tool-output-t2").textContent).toContain("line two");
    expect(screen.getByTestId("tool-args-t2").textContent).toBe("--flag value");
    expect(screen.getByTestId("tool-elapsed-t2").textContent).toBe("3s");
    expect(screen.getByTestId("tool-artifacts-t2").textContent).toContain("out/log.txt");
  });
});