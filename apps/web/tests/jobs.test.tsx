import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouterProvider } from "./helpers/router-provider";
import { Route } from "@/routes/jobs";
import type { JarvisJob } from "@/lib/jobs";

const JobsComponent = Route.options.component!;

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderJobs() {
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouterProvider initialEntries={["/jobs"]}>
        <JobsComponent />
      </MemoryRouterProvider>
    </QueryClientProvider>,
  );
}

function jsonOk(body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

const job: JarvisJob = {
  id: "j1",
  name: "Nightly digest",
  schedule: "0 9 * * *",
  scheduleLabel: "0 9 * * *",
  timezone: "UTC",
  enabled: true,
  state: "queued",
  nextRunAt: "2026-08-28T09:00:00Z",
  lastRunAt: "2026-08-27T09:00:00Z",
  model: "gpt-5",
  provider: "openai",
  deliveryTarget: "email digest",
  failureStreak: 0,
};

beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("jobs route — jobs tab", () => {
  it("renders the loading state before data arrives", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderJobs();
    expect(await screen.findByTestId("state-loading")).toBeInTheDocument();
  });

  it("renders normalized jobs with schedule and actions", async () => {
    vi.stubGlobal("fetch", jsonOk([job]));
    renderJobs();
    expect(await screen.findByTestId("job-j1")).toBeInTheDocument();
    expect(screen.getByText("Nightly digest")).toBeInTheDocument();
    // canonical schedule is preserved verbatim with timezone
    expect(screen.getByTestId("schedule-j1")).toHaveTextContent("0 9 * * * (UTC)");
    expect(screen.getByTestId("pause-j1")).toBeInTheDocument();
    expect(screen.getByTestId("run-now-j1")).toBeInTheDocument();
    expect(screen.getByTestId("remove-j1")).toBeInTheDocument();
  });

  it("renders the error state with retry when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    renderJobs();
    expect(await screen.findByTestId("state-error")).toBeInTheDocument();
  });

  it("renders the empty state when no jobs exist", async () => {
    vi.stubGlobal("fetch", jsonOk([]));
    renderJobs();
    expect(await screen.findByTestId("state-empty")).toBeInTheDocument();
  });

  it("filters jobs by state", async () => {
    const queued: JarvisJob = { ...job, id: "j2", name: "Queued one", state: "queued" };
    const paused: JarvisJob = { ...job, id: "j3", name: "Paused one", state: "paused", enabled: false };
    vi.stubGlobal("fetch", jsonOk([queued, paused]));
    renderJobs();
    expect(await screen.findByTestId("job-j2")).toBeInTheDocument();
    const trigger = screen.getByLabelText("Filter by state");
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "paused" }));
    expect(screen.queryByTestId("job-j2")).not.toBeInTheDocument();
    expect(screen.getByTestId("job-j3")).toBeInTheDocument();
  });

  it("toggles a job detail panel on expand", async () => {
    vi.stubGlobal("fetch", jsonOk([job]));
    renderJobs();
    expect(await screen.findByTestId("job-j1")).toBeInTheDocument();
    expect(screen.queryByTestId("detail-j1")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nightly digest" }));
    expect(screen.getByTestId("detail-j1")).toBeInTheDocument();
    expect(screen.getByTestId("detail-j1")).toHaveTextContent("0 9 * * *");
  });

  it("sends pause with CSRF header and updates the cache optimistically", async () => {
    document.cookie = "csrf=test-token; path=/";
    let paused = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/pause")) {
        expect((init?.headers as Record<string, string>)["x-csrf-token"]).toBe("test-token");
        paused = true;
        return new Response("{}", { status: 200 });
      }
      return new Response(JSON.stringify([paused ? { ...job, enabled: false, state: "paused" } : job]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderJobs();
    expect(await screen.findByTestId("job-j1")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("pause-j1"));
    await waitFor(() => {
      expect(screen.getByTestId("resume-j1")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gateway/jobs/j1/pause",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rolls the optimistic pause back when the request fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/pause")) return new Response("err", { status: 500 });
      return new Response(JSON.stringify([job]), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderJobs();
    expect(await screen.findByTestId("job-j1")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("pause-j1"));
    // after failed mutation + invalidate, the original enabled job comes back
    await waitFor(
      () => {
        expect(screen.getByTestId("pause-j1")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.queryByTestId("resume-j1")).not.toBeInTheDocument();
  });

  it("confirms before removing a job", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/gateway/jobs/j1") return new Response("{}", { status: 200 });
      return new Response(JSON.stringify([job]), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderJobs();
    expect(await screen.findByTestId("job-j1")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("remove-j1"));
    expect(window.confirm).toHaveBeenCalledWith('Remove job "Nightly digest"? This cannot be undone.');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/gateway/jobs/j1", expect.objectContaining({ method: "DELETE" }));
    });
  });
});

describe("jobs route — runs tab", () => {
  const run = {
    id: "r1",
    jobId: "j1",
    state: "succeeded",
    startedAt: "2026-08-27T09:00:00Z",
    finishedAt: "2026-08-27T09:01:00Z",
    output: "digest delivered",
    usage: { inputTokens: 100, outputTokens: 50 },
    costUsd: 0.01,
    deliveryResult: "email sent",
    continuable: false,
  };

  it("lists runs and shows redacted output in the detail panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/runs")) return new Response(JSON.stringify([run]), { status: 200, headers: { "content-type": "application/json" } });
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    renderJobs();
    await userEvent.click(await screen.findByTestId("tab-runs"));
    expect(await screen.findByTestId("run-r1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Run r1/ }));
    expect(screen.getByTestId(`run-output-r1`)).toHaveTextContent("digest delivered");
    expect(screen.getByText(/tokens: 100 in \/ 50 out/)).toBeInTheDocument();
  });

  it("shows an error state when runs fail to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    renderJobs();
    await userEvent.click(await screen.findByTestId("tab-runs"));
    expect(await screen.findByTestId("state-error")).toBeInTheDocument();
  });
});

describe("jobs route — processes tab", () => {
  it("lists background processes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/processes")) {
          return new Response(
            JSON.stringify([{ id: "p1", name: "watcher", pid: 42, state: "running", startedAt: "2026-08-27T00:00:00Z", script: "watch files" }]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    renderJobs();
    await userEvent.click(await screen.findByTestId("tab-processes"));
    expect(await screen.findByTestId("process-p1")).toBeInTheDocument();
    expect(screen.getByText("watcher")).toBeInTheDocument();
    expect(screen.getByText("pid 42")).toBeInTheDocument();
  });
});

describe("jobs route — incidents tab", () => {
  it("lists incidents and acknowledges them", async () => {
    const incident = { id: "i1", jobId: "j1", title: "Job failed 3x", severity: "critical", openedAt: "2026-08-27T00:00:00Z", acknowledged: false };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/incidents") && init?.method === undefined) {
        return new Response(JSON.stringify([incident]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/acknowledge")) return new Response("{}", { status: 200 });
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderJobs();
    await userEvent.click(await screen.findByTestId("tab-incidents"));
    expect(await screen.findByTestId("incident-i1")).toBeInTheDocument();
    expect(screen.getByText("Job failed 3x")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("ack-i1"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/gateway/incidents/i1/acknowledge", expect.objectContaining({ method: "POST" }));
    });
  });
});
