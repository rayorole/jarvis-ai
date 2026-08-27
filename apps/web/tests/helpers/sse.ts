import type { StreamEnvelope } from "@/lib/chat-runtime";

/** Test helper shared by chat-runtime and chat route tests: envelope + SSE mocks. */

export function envelope(overrides: Partial<StreamEnvelope> = {}): StreamEnvelope {
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

export function sseFrame(env: StreamEnvelope, eventId?: string): string {
  const lines = [`data: ${JSON.stringify(env)}`];
  if (eventId !== undefined) lines.unshift(`id: ${eventId}`);
  return lines.join("\n") + "\n\n";
}

/** A ReadableStream-backed Response mock from string chunks. */
export function sseResponse(chunks: string[], opts: { contentType?: string; ok?: boolean } = {}) {
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
