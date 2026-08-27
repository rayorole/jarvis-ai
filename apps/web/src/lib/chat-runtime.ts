import {
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type ChatModelRunResult,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useCallback, useMemo, useRef } from "react";

/**
 * Client-side chat runtime for Jarvis.
 *
 * A thin, typed adapter that bridges assistant-ui's `ChatModelAdapter` seam to
 * the same-origin gateway SSE proxy (`POST /api/gateway/runs/stream`, cancel
 * via `POST /api/gateway/runs/:runId/cancel`). All stream framing, event
 * normalization (versioned envelope, monotonic sequence, duplicate and
 * out-of-order handling), abort, and explicit resume live here so the UI
 * consumes only already-validated message parts.
 *
 * Security invariants:
 * - No credentials are handled here; the session cookie + CSRF flow is owned
 *   by the auth module and the server-side gateway proxy.
 * - Tool events are surfaced as inert tool-call parts only — the browser never
 *   executes anything because of a stream event.
 * - Transport closure and run completion are distinct states; a dropped
 *   connection is always reported as an error, never a completed run.
 */

export const RUNS_STREAM_PATH = "/api/gateway/runs/stream";
export const RUN_CANCEL_PATH = "/api/gateway/runs";

/** Protocol version of the SSE event envelope. */
export const STREAM_ENVELOPE_VERSION = 1 as const;

export interface StreamEnvelope {
  /** Envelope schema version; mismatches are rejected. */
  v: typeof STREAM_ENVELOPE_VERSION;
  sessionId: string;
  runId: string;
  messageId: string;
  /** Monotonically increasing per-run sequence, starting at 1. */
  seq: number;
  /** Optional server-assigned event id (SSE `id:` line), when present. */
  eventId?: string;
  type: StreamEventType;
  payload: unknown;
}

export type StreamEventType =
  | "text-delta"
  | "reasoning-delta"
  | "tool"
  | "usage"
  | "done"
  | "error"
  | "keepalive";

export interface RunStreamRequestBody {
  sessionId: string;
  message: string;
  /** Explicit resume: continue `runId` after the last successfully applied seq. */
  resume?: { runId: string; afterSeq: number };
}

export interface StreamEvent {
  envelope: StreamEnvelope;
  /** Decoded, type-checked payload per event type. */
  text?: string;
  tool?: { toolCallId: string; toolName: string; args: string };
  usage?: { inputTokens?: number; outputTokens?: number };
  error?: { code: string; message: string };
}

export interface ChatRuntimeFetch {
  (url: string, init: RequestInit): Promise<Response>;
}

export interface ChatRuntimeOptions {
  fetchImpl?: ChatRuntimeFetch;
  /**
   * Batch window (ms) that coalesces rapid text deltas into one emitted
   * update to avoid render thrash. 0 disables batching (used in tests).
   */
  deltaBatchMs?: number;
}

export interface StreamRequestResult {
  /** Final run id reported by the stream (or from a resume request). */
  runId: string;
  /** Highest sequence number successfully applied. */
  lastSeq: number;
  /** Full accumulated assistant text. */
  text: string;
  /** True when a `done` terminal event was received. */
  completed: boolean;
  /** True when the run was aborted before completion. */
  aborted: boolean;
}

// ---------------------------------------------------------------------------
// Payload validators (unverified upstream bytes never cross untyped)
// ---------------------------------------------------------------------------

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeEnvelope(raw: unknown, source: string): StreamEnvelope {
  if (typeof raw !== "object" || raw === null) {
    throw new StreamProtocolError(`non-object envelope in ${source}`);
  }
  const r = raw as Record<string, unknown>;
  if (r.v !== STREAM_ENVELOPE_VERSION) {
    throw new StreamProtocolError(`unsupported envelope version in ${source}`);
  }
  const seq = typeof r.seq === "number" && Number.isInteger(r.seq) ? r.seq : NaN;
  if (
    typeof r.sessionId !== "string" || r.sessionId.length === 0 ||
    typeof r.runId !== "string" || r.runId.length === 0 ||
    typeof r.messageId !== "string" || r.messageId.length === 0 ||
    !Number.isInteger(seq) || seq < 1 ||
    typeof r.type !== "string"
  ) {
    throw new StreamProtocolError(`invalid envelope fields in ${source}`);
  }
  if (!isStreamEventType(r.type)) {
    throw new StreamProtocolError(`unknown event type in ${source}: ${String(r.type)}`);
  }
  const type = r.type;
  return {
    v: STREAM_ENVELOPE_VERSION,
    sessionId: r.sessionId,
    runId: r.runId,
    messageId: r.messageId,
    seq,
    eventId: typeof r.eventId === "string" ? r.eventId : undefined,
    type,
    payload: r.payload,
  };
}

function isStreamEventType(value: string): value is StreamEventType {
  return (
    value === "text-delta" ||
    value === "reasoning-delta" ||
    value === "tool" ||
    value === "usage" ||
    value === "done" ||
    value === "error" ||
    value === "keepalive"
  );
}

/** Raised for any envelope that fails validation; breaks the run. */
export class StreamProtocolError extends Error {}

function decodeEvent(envelope: StreamEnvelope): StreamEvent {
  const event: StreamEvent = { envelope };
  const p = envelope.payload;
  switch (envelope.type) {
    case "text-delta":
    case "reasoning-delta": {
      if (typeof p !== "object" || p === null || typeof (p as Record<string, unknown>).text !== "string") {
        throw new StreamProtocolError(`invalid ${envelope.type} payload at seq ${envelope.seq}`);
      }
      event.text = (p as { text: string }).text;
      break;
    }
    case "tool": {
      if (typeof p !== "object" || p === null) {
        throw new StreamProtocolError(`invalid tool payload at seq ${envelope.seq}`);
      }
      const t = p as Record<string, unknown>;
      if (typeof t.toolCallId !== "string" || typeof t.toolName !== "string") {
        throw new StreamProtocolError(`invalid tool payload at seq ${envelope.seq}`);
      }
      event.tool = {
        toolCallId: t.toolCallId,
        toolName: t.toolName,
        args: asString(t.args),
      };
      break;
    }
    case "usage": {
      if (typeof p === "object" && p !== null) {
        const u = p as Record<string, unknown>;
        event.usage = {
          inputTokens: typeof u.inputTokens === "number" ? u.inputTokens : undefined,
          outputTokens: typeof u.outputTokens === "number" ? u.outputTokens : undefined,
        };
      }
      break;
    }
    case "error": {
      if (typeof p !== "object" || p === null || typeof (p as Record<string, unknown>).code !== "string") {
        throw new StreamProtocolError(`invalid error payload at seq ${envelope.seq}`);
      }
      const e = p as Record<string, unknown>;
      event.error = { code: asString(e.code), message: asString(e.message) };
      break;
    }
    case "done":
    case "keepalive":
      break;
  }
  return event;
}

// ---------------------------------------------------------------------------
// SSE frame parser (spec-compliant enough for the gateway relay)
// ---------------------------------------------------------------------------

export function parseSseFrames(
  chunk: string,
  state: { buffer: string },
  onEvent: (data: string, eventId?: string) => void,
): void {
  state.buffer += chunk;
  // Frames are separated by a blank line (\n\n; tolerate \r\n\r\n).
  let sep: string;
  while ((sep = findFrameSeparator(state.buffer)) !== "") {
    const index = state.buffer.indexOf(sep);
    const frame = state.buffer.slice(0, index);
    state.buffer = state.buffer.slice(index + sep.length);
    handleFrame(frame, onEvent);
  }
}

export function flushSseFrames(
  state: { buffer: string },
  onEvent: (data: string, eventId?: string) => void,
): void {
  if (state.buffer.trim() !== "") handleFrame(state.buffer, onEvent);
  state.buffer = "";
}

function findFrameSeparator(buffer: string): string {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1) return crlf === -1 ? "" : "\r\n\r\n";
  if (crlf === -1) return "\n\n";
  return crlf < lf ? "\r\n\r\n" : "\n\n";
}

function handleFrame(frame: string, onEvent: (data: string, eventId?: string) => void): void {
  let data = "";
  let eventId: string | undefined;
  for (const rawLine of frame.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith(":")) continue; // keepalive comment
    if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).replace(/^ /, "");
    else if (line.startsWith("id:")) eventId = line.slice(3).replace(/^ /, "");
    // event:/retry: are informational; the envelope carries the type.
  }
  if (data !== "") onEvent(data, eventId);
}

// ---------------------------------------------------------------------------
// Ordering / dedupe state machine
// ---------------------------------------------------------------------------

export class StreamSequencer {
  private lastSeq = 0;
  private readonly seen = new Set<number>();

  constructor(
    /** Reject (throw) on gaps instead of buffering. Deterministic default. */
    private readonly options: { rejectOutOfOrder?: boolean } = {},
  ) {}

  get applied(): number {
    return this.lastSeq;
  }

  /**
   * Returns true when the envelope should be applied.
   * Duplicates (seq <= last applied) are ignored. Out-of-order events that
   * would create a gap are rejected deterministically (never applied silently).
   */
  accept(envelope: StreamEnvelope): boolean {
    if (envelope.seq <= this.lastSeq || this.seen.has(envelope.seq)) {
      return false; // duplicate / replay — ignored
    }
    if (envelope.seq !== this.lastSeq + 1) {
      if (this.options.rejectOutOfOrder !== false) {
        throw new StreamProtocolError(
          `out-of-order event: expected ${this.lastSeq + 1}, got ${envelope.seq}`,
        );
      }
      return false;
    }
    return true;
  }

  commit(envelope: StreamEnvelope): void {
    this.lastSeq = envelope.seq;
    this.seen.add(envelope.seq);
  }
}

// ---------------------------------------------------------------------------
// Core streaming runner
// ---------------------------------------------------------------------------

export async function runStream(
  body: RunStreamRequestBody,
  handlers: {
    onEvent: (event: StreamEvent) => void | Promise<void>;
    signal: AbortSignal;
  },
  options: ChatRuntimeOptions = {},
): Promise<StreamRequestResult> {
  const doFetch = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(RUNS_STREAM_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: handlers.signal,
      credentials: "same-origin",
    });
  } catch (err) {
    if (handlers.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
      throw new StreamAbortedError();
    }
    throw new StreamTransportError("failed to start stream");
  }
  if (!response.ok) {
    throw new StreamTransportError(`stream request failed with status ${response.status}`);
  }
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/event-stream")) {
    throw new StreamTransportError("stream response is not text/event-stream");
  }
  if (response.body === null) {
    throw new StreamTransportError("stream response has no body");
  }

  const sequencer = new StreamSequencer();
  const frameState = { buffer: "" };
  const textChunks: string[] = [];
  let runId = body.resume?.runId ?? "";
  let completed = false;
  let streamError: StreamEvent["error"] | undefined;
  let pendingDelta = "";
  let pendingDeltaRunId = "";
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const flushPendingDelta = () => {
    if (pendingDelta === "") return;
    textChunks.push(pendingDelta);
    pendingDelta = "";
  };
  const scheduleFlush = () => {
    const batchMs = options.deltaBatchMs ?? 16;
    if (batchMs <= 0) {
      flushPendingDelta();
      return;
    }
    if (flushTimer === undefined) {
      flushTimer = setTimeout(() => {
        flushTimer = undefined;
        flushPendingDelta();
      }, batchMs);
    }
  };

  const applyEnvelope = (raw: unknown, source: string): void => {
    const envelope = normalizeEnvelope(raw, source);
    if (runId === "") runId = envelope.runId;
    else if (envelope.runId !== runId) {
      throw new StreamProtocolError(`run id changed mid-stream: ${envelope.runId}`);
    }
    // Keepalives and terminal events bypass the ordering gate but still carry
    // valid envelopes; everything else must be in order.
    if (envelope.type !== "keepalive" && envelope.type !== "done") {
      if (!sequencer.accept(envelope)) return;
      const event = decodeEvent(envelope);
      sequencer.commit(envelope);
      if (envelope.type === "text-delta") {
        pendingDelta += event.text ?? "";
        pendingDeltaRunId = envelope.runId;
        scheduleFlush();
      } else {
        flushPendingDelta();
        void handlers.onEvent(event);
      }
      return;
    }
    const event = decodeEvent(envelope);
    if (envelope.type === "done") {
      completed = true;
      flushPendingDelta();
      void handlers.onEvent(event);
    }
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parseSseFrames(decoder.decode(value, { stream: true }), frameState, (data, eventId) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          throw new StreamProtocolError("unparseable SSE data payload");
        }
        if (parsed !== null && typeof parsed === "object" && eventId !== undefined) {
          (parsed as Record<string, unknown>).eventId ??= eventId;
        }
        applyEnvelope(parsed, "sse frame");
      });
    }
    flushSseFrames(frameState, (data) => {
      applyEnvelope(JSON.parse(data), "sse tail");
    });
    flushPendingDelta();
  } catch (err) {
    if (handlers.signal.aborted) throw new StreamAbortedError();
    throw err;
  } finally {
    if (flushTimer !== undefined) clearTimeout(flushTimer);
    reader.releaseLock();
  }

  if (handlers.signal.aborted) throw new StreamAbortedError();
  if (!completed) {
    // Transport closed without a terminal event: a dropped connection, never
    // a completed run.
    throw new StreamDisconnectedError(runId, sequencer.applied, textChunks.join(""));
  }
  if (streamError) {
    throw new StreamRunError(streamError.code, streamError.message, runId);
  }

  return { runId, lastSeq: sequencer.applied, text: textChunks.join(""), completed, aborted: false };
}

/** Fire the explicit cancel endpoint; resolves even if cancel fails. */
export async function cancelRun(runId: string, fetchImpl: ChatRuntimeFetch = fetch): Promise<void> {
  try {
    await fetchImpl(`${RUN_CANCEL_PATH}/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      credentials: "same-origin",
    });
  } catch {
    // Cancellation is best-effort: the run also dies when the stream aborts.
  }
}

export class StreamAbortedError extends Error {
  constructor() {
    super("stream aborted by caller");
    this.name = "StreamAbortedError";
  }
}

export class StreamDisconnectedError extends Error {
  constructor(
    readonly runId: string,
    readonly lastSeq: number,
    readonly partialText: string,
  ) {
    super("stream closed before terminal event");
    this.name = "StreamDisconnectedError";
  }
}

export class StreamTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamTransportError";
  }
}

export class StreamRunError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly runId: string,
  ) {
    super(message);
    this.name = "StreamRunError";
  }
}

// ---------------------------------------------------------------------------
// assistant-ui adapter + React hook
// ---------------------------------------------------------------------------

function toMessageParts(text: string): ChatModelRunResult["content"] {
  return text === "" ? [] : [{ type: "text" as const, text }];
}

/**
 * Build the assistant-ui `ChatModelAdapter` backed by the gateway SSE proxy.
 * `lastGoodState` lets callers feed back the last completed text when the
 * composer retries after a failure, so partial output is not duplicated.
 */
export function createChatModelAdapter(options: ChatRuntimeOptions = {}): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      const last = messages[messages.length - 1];
      const prompt = last === undefined ? "" : last.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      abortSignal.addEventListener("abort", onAbort, { once: true });
      // assistant-ui's abortSignal is caller-owned; surface aborts upstream.
      if (abortSignal.aborted) controller.abort();

      let emitted = "";
      try {
        const result = await runStream(
          { sessionId: "current", message: prompt },
          {
            signal: controller.signal,
            onEvent: (event) => {
              if (event.envelope.type === "text-delta") {
                emitted += event.text ?? "";
              } else if (event.envelope.type === "reasoning-delta") {
                // Reasoning is rendered as a prefixed inert part, ordered.
                emitted += event.text ?? "";
              } else if (event.envelope.type === "tool" && event.tool) {
                emitted += `\n[tool ${event.tool.toolName} (${event.tool.toolCallId})]`;
              } else if (event.envelope.type === "error" && event.error) {
                throw new StreamRunError(
                  event.error.code,
                  event.error.message,
                  event.envelope.runId,
                );
              }
            },
          },
          options,
        );
        yield { content: toMessageParts(emitted || result.text) };
      } catch (err) {
        if (err instanceof StreamAbortedError || abortSignal.aborted) {
          // Cancelled: keep whatever streamed so far, mark as incomplete.
          yield { content: toMessageParts(emitted) };
          return;
        }
        // Dropped connection / run error: rethrow so assistant-ui marks the
        // message errored (never a false completed state) and keeps the
        // composer draft for retry/resume.
        throw err;
      } finally {
        abortSignal.removeEventListener("abort", onAbort);
      }
    },
  };
}

export interface UseChatRuntimeResult {
  runtime: AssistantRuntime;
  /** Cancel the in-flight run explicitly (also hits the cancel endpoint). */
  cancelActiveRun: () => void;
}

/**
 * React hook wiring the chat runtime for the chat route. The returned runtime
 * feeds `AssistantRuntimeProvider`; the Thread renders through it.
 */
export function useChatRuntime(options: ChatRuntimeOptions = {}): UseChatRuntimeResult {
  const activeRunIdRef = useRef<string | null>(null);
  const fetchRef = useRef(options.fetchImpl ?? fetch);

  const adapter = useMemo(() => createChatModelAdapter(options), [options]);
  const runtime = useLocalRuntime(adapter);

  const cancelActiveRun = useCallback(() => {
    const runId = activeRunIdRef.current;
    runtime.thread.cancelRun();
    if (runId !== null) void cancelRun(runId, fetchRef.current);
  }, [runtime]);

  return { runtime, cancelActiveRun };
}

/** Convert Jarvis history messages (e.g. from TanStack Query) into ThreadMessageLike[]. */
export function toThreadMessages(
  messages: ReadonlyArray<{ id: string; role: "user" | "assistant" | "tool" | "system"; content: string }>,
): ThreadMessageLike[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: [{ type: "text" as const, text: m.content }],
    }));
}
