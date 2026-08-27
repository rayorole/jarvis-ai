import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouterProvider } from "./helpers/router-provider";
import { Route } from "@/routes/chat";
import { envelope, sseFrame, sseResponse } from "./helpers/sse";

/** Mount the chat route's component under a memory router at /chat. */
function renderChat() {
  const ChatComponent = Route.options.component!;
  return render(
    <MemoryRouterProvider initialEntries={["/chat"]}>
      <ChatComponent />
    </MemoryRouterProvider>,
  );
}

/** Install a fetch mock streaming a full assistant reply. */
function mockStreamedReply(text: string) {
  return vi.fn(async () =>
    sseResponse([
      sseFrame(envelope({ seq: 1, type: "text-delta", payload: { text } })),
      sseFrame(envelope({ seq: 2, type: "done", payload: {} })),
    ]),
  );
}

describe("chat route", () => {
  it("renders the empty state before any conversation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([])));
    renderChat();
    expect(await screen.findByText("No conversation open")).toBeInTheDocument();
  });

  it("streams a user message and renders the assistant reply via the runtime", async () => {
    const fetchMock = mockStreamedReply("streamed reply");
    vi.stubGlobal("fetch", fetchMock);
    renderChat();

    const input = await screen.findByLabelText("Message");
    await userEvent.type(input, "hello jarvis{Enter}");

    await waitFor(() => {
      expect(screen.getAllByTestId("message-text").some((el) => el.textContent === "streamed reply")).toBe(true);
    });

    // The runtime hits the same-origin gateway SSE proxy.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gateway/runs/stream",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ accept: "text/event-stream" }),
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ sessionId: "current", message: "hello jarvis" });
  });

  it("renders the user message in the thread", async () => {
    const fetchMock = mockStreamedReply("ok");
    vi.stubGlobal("fetch", fetchMock);
    renderChat();

    const input = await screen.findByLabelText("Message");
    await userEvent.type(input, "my question{Enter}");

    await waitFor(() => {
      const userMessages = screen.getAllByTestId("message-user");
      expect(userMessages.some((el) => el.textContent?.includes("my question"))).toBe(true);
    });
  });
});
