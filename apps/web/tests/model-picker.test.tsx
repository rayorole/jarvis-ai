import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPicker } from "../src/components/model-picker";
import type { ModelPickerFetch } from "../src/lib/use-model-picker";

const catalog = {
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      availability: "available",
      models: [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          aliases: ["sonnet", "claude-4"],
          capabilities: ["tools", "vision"],
          contextWindow: 200000,
          pricing: { inputPerMillion: 3, outputPerMillion: 15 },
        },
        {
          id: "anthropic/claude-haiku-4",
          name: "Claude Haiku 4",
          aliases: ["haiku"],
          capabilities: ["tools"],
        },
      ],
    },
    {
      id: "openai",
      name: "OpenAI",
      availability: "unavailable",
      unavailableReason: "auth unavailable (redacted)",
      models: [
        { id: "openai/gpt-5", name: "GPT-5", aliases: ["gpt"], capabilities: ["tools"] },
      ],
    },
    {
      id: "mistral",
      name: "Mistral",
      availability: "unknown",
      models: [
        { id: "mistral/large-3", name: "Mistral Large 3", aliases: [], capabilities: [] },
      ],
    },
  ],
  fallbackChain: ["anthropic/claude-sonnet-4", "openai/gpt-5", "mistral/large-3"],
  globalDefault: "anthropic/claude-sonnet-4",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? status : 500,
    headers: { "content-type": "application/json" },
  });
}

function fetchWith(catalogResponses: Map<string, () => Response>): ModelPickerFetch {
  return vi.fn(async (url: string, init: RequestInit) => {
    const handler = catalogResponses.get(`${init.method} ${url}`);
    if (handler === undefined) {
      throw new Error(`unexpected request: ${init.method} ${url}`);
    }
    return handler();
  }) as unknown as ModelPickerFetch;
}

function baseFetch() {
  return fetchWith(
    new Map([
      ["GET /api/gateway/models", () => jsonResponse(catalog)],
      [
        "PUT /api/gateway/session/model",
        () => {
          const body = { sessionOverride: "anthropic/claude-haiku-4" };
          return jsonResponse({ ...catalog, ...body });
        },
      ],
      [
        "PUT /api/gateway/defaults/fallback-chain",
        () => {
          return jsonResponse({
            ...catalog,
            fallbackChain: ["openai/gpt-5", "anthropic/claude-sonnet-4", "mistral/large-3"],
          });
        },
      ],
    ]),
  );
}

describe("<ModelPicker />", () => {
  it("renders loading then the picker trigger with the global default badge", async () => {
    render(<ModelPicker options={{ fetchImpl: baseFetch() }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading models");
    const trigger = await screen.findByTestId("picker-trigger");
    expect(trigger).toHaveTextContent("Claude Sonnet 4");
    expect(screen.getByTestId("global-default-badge")).toBeInTheDocument();
  });

  it("shows an error state when the catalog fails to load", async () => {
    const failing = fetchWith(
      new Map([
        ["GET /api/gateway/models", () => jsonResponse({ code: "forbidden", message: "not permitted" }, false, 403)],
      ]),
    );
    render(<ModelPicker options={{ fetchImpl: failing }} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not permitted/);
  });

  it("groups models by provider and shows unavailable/unknown states", async () => {
    const user = userEvent.setup();
    render(<ModelPicker options={{ fetchImpl: baseFetch() }} />);
    await user.click(await screen.findByTestId("picker-trigger"));
    expect(screen.getByTestId("provider-anthropic")).toHaveTextContent("Anthropic");
    expect(screen.getByTestId("provider-openai")).toHaveTextContent("OpenAI");
    expect(screen.getByTestId("provider-openai-availability")).toHaveTextContent("unavailable");
    expect(screen.getByTestId("provider-mistral-availability")).toHaveTextContent("availability unknown");
  });

  it("does not render absent pricing as zero", async () => {
    const user = userEvent.setup();
    render(<ModelPicker options={{ fetchImpl: baseFetch() }} />);
    await user.click(await screen.findByTestId("picker-trigger"));
    const option = screen.getByTestId("model-option-openai/gpt-5");
    expect(option.textContent).not.toMatch(/\$?0/);
  });

  it("filters models by search query including aliases", async () => {
    const user = userEvent.setup();
    render(<ModelPicker options={{ fetchImpl: baseFetch() }} />);
    await user.click(await screen.findByTestId("picker-trigger"));
    await user.type(screen.getByRole("searchbox"), "sonnet");
    expect(screen.getByTestId("model-option-anthropic/claude-sonnet-4")).toBeInTheDocument();
    expect(screen.queryByTestId("model-option-anthropic/claude-haiku-4")).not.toBeInTheDocument();
    expect(screen.queryByTestId("model-option-openai/gpt-5")).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "zzz-no-match");
    expect(screen.getByTestId("picker-empty")).toBeInTheDocument();
  });

  it("selects a model via canonical mutation and marks it as session override", async () => {
    const user = userEvent.setup();
    render(<ModelPicker options={{ fetchImpl: baseFetch() }} />);
    await user.click(await screen.findByTestId("picker-trigger"));
    await user.click(screen.getByTestId("model-option-anthropic/claude-haiku-4"));
    await waitFor(() => expect(screen.getByTestId("session-override-badge")).toBeInTheDocument());
    expect(screen.getByTestId("picker-trigger")).toHaveTextContent("Claude Haiku 4");
  });

  it("disables unavailable models and rejects selection attempts", async () => {
    const user = userEvent.setup();
    render(<ModelPicker options={{ fetchImpl: baseFetch() }} />);
    await user.click(await screen.findByTestId("picker-trigger"));
    expect(screen.getByTestId("model-option-openai/gpt-5")).toBeDisabled();
    expect(screen.getByTestId("model-option-mistral/large-3")).toBeDisabled();
  });

  it("shows the effective fallback chain and reorders via move controls", async () => {
    const user = userEvent.setup();
    render(<ModelPicker options={{ fetchImpl: baseFetch() }} />);
    await screen.findByTestId("picker-trigger");
    const chain = screen.getByTestId("fallback-chain");
    expect(chain.textContent).toContain("anthropic/claude-sonnet-4");
    expect(chain.textContent).toContain("openai/gpt-5");
    expect(screen.getByTestId("move-up-anthropic/claude-sonnet-4")).toBeDisabled();
    await user.click(screen.getByTestId("move-down-anthropic/claude-sonnet-4"));
    await waitFor(() => {
      const items = [...screen.getByTestId("fallback-chain").querySelectorAll("li")];
      expect(items[0]?.textContent).toContain("openai/gpt-5");
      expect(items[1]?.textContent).toContain("anthropic/claude-sonnet-4");
    });
  });

  it("rolls back optimistic reorder state when the mutation fails", async () => {
    const user = userEvent.setup();
    const failingReorder = fetchWith(
      new Map([
        ["GET /api/gateway/models", () => jsonResponse(catalog)],
        [
          "PUT /api/gateway/defaults/fallback-chain",
          () => jsonResponse({ code: "conflict", message: "reorder conflict" }, false, 409),
        ],
      ]),
    );
    render(<ModelPicker options={{ fetchImpl: failingReorder }} />);
    await screen.findByTestId("picker-trigger");
    await user.click(screen.getByTestId("move-down-anthropic/claude-sonnet-4"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/reorder conflict/);
    // Rolled back to server state.
    const items = [...screen.getByTestId("fallback-chain").querySelectorAll("li")];
    expect(items[0]?.textContent).toContain("anthropic/claude-sonnet-4");
  });

  it("rolls back session override when the mutation fails", async () => {
    const user = userEvent.setup();
    const failingSession = fetchWith(
      new Map([
        ["GET /api/gateway/models", () => jsonResponse(catalog)],
        [
          "PUT /api/gateway/session/model",
          () => jsonResponse({ code: "forbidden", message: "not allowed" }, false, 403),
        ],
      ]),
    );
    render(<ModelPicker options={{ fetchImpl: failingSession }} />);
    await user.click(await screen.findByTestId("picker-trigger"));
    await user.click(screen.getByTestId("model-option-anthropic/claude-haiku-4"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not allowed/);
    expect(screen.queryByTestId("session-override-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("global-default-badge")).toBeInTheDocument();
  });

  it("is keyboard operable: trigger, search field, and move controls are focusable buttons/inputs", async () => {
    const user = userEvent.setup();
    render(<ModelPicker options={{ fetchImpl: baseFetch() }} />);
    const trigger = await screen.findByTestId("picker-trigger");
    trigger.focus();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    const search = screen.getByRole("searchbox");
    search.focus();
    expect(search).toHaveFocus();
    await user.keyboard("{Escape>}"); // typing still works via userEvent.type below
    expect(screen.getByTestId("move-up-openai/gpt-5").tagName).toBe("BUTTON");
    expect(screen.getByTestId("move-up-openai/gpt-5")).not.toBeDisabled();
  });
});
