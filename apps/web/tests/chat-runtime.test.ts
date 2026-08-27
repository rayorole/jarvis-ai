import { describe, expect, it } from "vitest";
import {
  flushSseFrames,
  parseSseFrames,
  StreamDisconnectedError,
  StreamProtocolError,
  StreamAbortedError,
  StreamSequencer,
  StreamTransportError,
  cancelRun,
  runStream,
  type StreamEnvelope,
} from "@/lib/chat-runtime";

// ---------------------------------------------------------------------------
// Helpers: build a versioned envelope and an SSE stream from envelopes.
// ---------------------------------------------------------------------------

function envelope(overrides: Partial<StreamEnvelope> = {}): StreamEnvelope {
  return {
    v: 1,
    sessionId: "s1",
    runId: "r1",
    messageId: "m1",
    seq: 1,
    type: "text-delta",
    payload: { text: "hello" },
    ...overrides,
  };
}

function sseFrame(env: StreamEnvelope, eventId?: string): string {
  const lines = [`data: ${JSON.stringify(env)}`];
  if (eventId !== undefined) lines.unshift(`id: ${eventId}`);
  return lines.join("\n") + "\n\n";
}

/** A ReadableStream-backed Response mock from string chunks. */
function sseResponse(chunks: string[], opts: { contentType?: string; ok?: boolean } = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return {
    ok: opts.ok ?? true,
    status: opts.ok === false ? 500 : 200,
    headers: new Headers({ "content-type": opts.contentType ?? "text/event-stream" }),
    body,
  } as unknown as Response;
}

function collectEvents() {
  const events: unknown[] = [];
  return {
    events,
    onEvent: (event: unknown) => {
      events.push(event);
    },
  };
}

// ---------------------------------------------------------------------------
// SSE frame parser
// ---------------------------------------------------------------------------

describe("SSE frame parsing", () => {
  it("parses complete frames split across chunks", () => {
    const state = { buffer: "" };
    const got: string[] = [];
    parseSseFrames('data: {"a":1}\n\nda', state, (data) => got.push(data));
    parseSseFrames('ta: {"a":2}\n\n', state, (data) => got.push(data));
    expect(got).toEqual(['{"a":1}', '{"a":2}']);
  });

  it("buffers partial frames until the blank-line separator arrives", () => {
    const state = { buffer: "" };
    const got: string[] = [];
    parseSseFrames('data: {"a":1}\n', state, (data) => got.push(data));
    expect(got).toEqual([]);
    parseSseFrames('\ndata: {"a":2}\n\n', state, (data) => got.push(data));
    expect(got).toEqual(['{"a":1}', '{"a":2}']);
  });

  it("tolerates CRLF separators and multi-line data", () => {
    const state = { buffer: "" };
    const got: string[] = [];
    parseSseFrames("data: line1\ndata: line2\r\n\r\n", state, (data) => got.push(data));
    expect(got).toEqual(["line1\nline2"]);
  });

  it("ignores comment keepalive lines and captures id fields", () => {
    const state = { buffer: "" };
    const got: Array<{ data: string; eventId?: string }> = [];
    parseSseFrames(
      ': ping\nid: evt-9\ndata: {"a":1}\n\n',
      state,
      (data, eventId) => got.push({ data, eventId }),
    );
    expect(got).toEqual([{ data: '{"a":1}', eventId: "evt-9" }]);
  });

  it("flushes a trailing frame without a separator", () => {
    const state = { buffer: "data: {\"a\":1}\n" };
    const got: string[] = [];
    flushSseFrames(state, (data) => got.push(data));
    expect(got).toEqual(['{"a":1}']);
    expect(state.buffer).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Sequencing / dedupe
// ---------------------------------------------------------------------------

describe("StreamSequencer", () => {
  it("accepts in-order events and tracks the applied sequence", () => {
    const seq = new StreamSequencer();
    expect(seq.accept(envelope({ seq: 1 }))).toBe(true);
    seq.commit(envelope({ seq: 1 }));
    expect(seq.accept(envelope({ seq: 2 }))).toBe(true);
    seq.commit(envelope({ seq: 2 }));
    expect(seq.applied).toBe(2);
  });

  it("ignores duplicate events", () => {
    const seq = new StreamSequencer();
    seq.commit(envelope({ seq: 1 }));
    expect(seq.accept(envelope({ seq: 1 }))).toBe(false);
  });

  it("throws on gaps instead of applying silently", () => {
    const seq = new StreamSequencer();
    seq.commit(envelope({ seq: 1 }));
    expect(() => seq.accept(envelope({ seq: 3 }))).toThrow(StreamProtocolError);
  });
});

// ---------------------------------------------------------------------------
// runStream over a mocked fetch/SSE transport
// ---------------------------------------------------------------------------

describe("runStream", () => {
  it("accumulates text deltas and reports a completed run", async () => {
    const { events, onEvent } = collectEvents();
    const fetchImpl = (async () =>
      sseResponse([
        sseFrame(envelope({ seq: 1, type: "text-delta", payload: { text: "Hel" } })),
        sseFrame(envelope({ seq: 2, type: "text-delta", payload: { text: "lo" } })),
        sseFrame(envelope({ seq: 3, type: "done", payload: {} })),
      ])) as unknown as typeof fetch;

    const result = await runStream(
      { sessionId: "s1", message: "hi" },
      { onEvent, signal: new AbortController().signal },
      { fetchImpl, deltaBatchMs: 0 },
    );

    expect(result).toEqual({ runId: "r1", lastSeq: 2, text: "Hello", completed: true, aborted: false });
    expect(events.map((e) => (e as { envelope: StreamEnvelope }).envelope.type)).toEqual(["done"]);
  });

  it("surfaces tool and usage events as inert parts", async () => {
    const { events, onEvent } = collectEvents();
    const fetchImpl = (async () =>
      sseResponse([
        sseFrame(
          envelope({
            seq: 1,
            type: "tool",
            payload: { toolCallId: "t1", toolName: "search", args: "{\"q\":\"x\"}" },
          }),
        ),
        sseFrame(envelope({ seq: 2, type: "usage", payload: { inputTokens: 3, outputTokens: 5 } })),
        sseFrame(envelope({ seq: 3, type: "done", payload: {} })),
      ])) as unknown as typeof fetch;

    const result = await runStream(
      { sessionId: "s1", message: "hi" },
      { onEvent, signal: new AbortController().signal },
      { fetchImpl, deltaBatchMs: 0 },
    );

    expect(result.completed).toBe(true);
    expect(events).toMatchObject([
      { tool: { toolCallId: "t1", toolName: "search" } },
      { usage: { inputTokens: 3, outputTokens: 5 } },
      { envelope: { type: "done" } },
    ]);
  });

  it("ignores duplicate frames and rejects out-of-order sequences", async () => {
    const { onEvent } = collectEvents();
    const fetchImpl = (async () =>
      sseResponse([
        sseFrame(envelope({ seq: 1, payload: { text: "a" } })),
        sseFrame(envelope({ seq: 1, payload: { text: "a-again" } })), // duplicate
        sseFrame(envelope({ seq: 3, payload: { text: "gap" } })), // gap
      ])) as unknown as typeof fetch;

    await expect(
      runStream(
        { sessionId: "s1", message: "hi" },
        { onEvent, signal: new AbortController().signal },
        { fetchImpl, deltaBatchMs: 0 },
      ),
    ).rejects.toThrow(StreamProtocolError);
  });

  it("throws StreamDisconnectedError when the transport closes without done", async () => {
    const fetchImpl = (async () =>
      sseResponse([sseFrame(envelope({ seq: 1, payload: { text: "partial" } }))])) as unknown as typeof fetch;

    const promise = runStream(
      { sessionId: "s1", message: "hi" },
      { onEvent: () => {}, signal: new AbortController().signal },
      { fetchImpl, deltaBatchMs: 0 },
    );
    await expect(promise).rejects.toThrow(StreamDisconnectedError);
    // And it carries the partial state for explicit resume.
    try {
      await runStream(
        { sessionId: "s1", message: "hi" },
        { onEvent: () => {}, signal: new AbortController().signal },
        { fetchImpl, deltaBatchMs: 0 },
      );
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(StreamDisconnectedError);
      expect(err).toMatchObject({ runId: "r1", lastSeq: 1, partialText: "partial" });
    }
  });

  it("throws StreamTransportError on non-2xx and non-SSE responses", async () => {
    const failing = (async () => sseResponse([], { ok: false })) as unknown as typeof fetch;
    await expect(
      runStream(
        { sessionId: "s1", message: "hi" },
        { onEvent: () => {}, signal: new AbortController().signal },
        { fetchImpl: failing },
      ),
    ).rejects.toThrow(StreamTransportError);

    const wrongType = (async () =>
      sseResponse([], { contentType: "application/json" })) as unknown as typeof fetch;
    await expect(
      runStream(
        { sessionId: "s1", message: "hi" },
        { onEvent: () => {}, signal: new AbortController().signal },
        { fetchImpl: wrongType },
      ),
    ).rejects.toThrow(StreamTransportError);
  });

  it("throws StreamAbortedError when the signal is aborted before completion", async () => {
    const controller = new AbortController();
    const fetchImpl = (async () => {
      controller.abort();
      return sseResponse([sseFrame(envelope({ seq: 1, payload: { text: "x" } }))]);
    }) as unknown as typeof fetch;

    await expect(
      runStream(
        { sessionId: "s1", message: "hi" },
        { onEvent: () => {}, signal: controller.signal },
        { fetchImpl, deltaBatchMs: 0 },
      ),
    ).rejects.toThrow(StreamAbortedError);
  });

  it("rejects unparseable SSE data and invalid envelopes", async () => {
    const badJson = (async () => sseResponse(["data: not-json\n\n"])) as unknown as typeof fetch;
    await expect(
      runStream(
        { sessionId: "s1", message: "hi" },
        { onEvent: () => {}, signal: new AbortController().signal },
        { fetchImpl: badJson },
      ),
    ).rejects.toThrow(StreamProtocolError);

    const badVersion = (async () =>
      sseResponse([sseFrame(envelope({ v: 99 as unknown as 1 }))])) as unknown as typeof fetch;
    await expect(
      runStream(
        { sessionId: "s1", message: "hi" },
        { onEvent: () => {}, signal: new AbortController().signal },
        { fetchImpl: badVersion },
      ),
    ).rejects.toThrow(StreamProtocolError);
  });

  it("does not treat an error event as a completed run", async () => {
    const fetchImpl = (async () =>
      sseResponse([
        sseFrame(
          envelope({ seq: 1, type: "error", payload: { code: "upstream", message: "boom" } }),
        ),
        sseFrame(envelope({ seq: 2, type: "done", payload: {} })),
      ])) as unknown as typeof fetch;

    // error event must reach handlers as a typed event…
    const seen: Array<{ error?: { code: string } }> = [];
    await expect(
      runStream(
        { sessionId: "s1", message: "hi" },
        {
          onEvent: (event) => {
            seen.push(event);
            if (event.error) throw new Error("run-level error propagates");
          },
          signal: new AbortController().signal,
        },
        { fetchImpl, deltaBatchMs: 0 },
      ),
    ).rejects.toThrow("run-level error propagates");
    expect(seen[0]?.error).toEqual({ code: "upstream", message: "boom" });
  });
});

// ---------------------------------------------------------------------------
// cancelRun
// ---------------------------------------------------------------------------

describe("cancelRun", () => {
  it("POSTs to the cancel endpoint and URL-encodes the run id", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true } as unknown as Response;
    }) as unknown as typeof fetch;

    await cancelRun("run/1 x", fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/gateway/runs/run%2F1%20x/cancel");
    expect(calls[0]?.init.method).toBe("POST");
  });

  it("swallows cancel failures (best-effort)", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(cancelRun("r1", fetchImpl)).resolves.toBeUndefined();
  });
});
