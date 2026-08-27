import { describe, expect, it } from "vitest";
import {
  CatalogValidationError,
  effectiveModelId as resolveEffectiveModel,
  isSelectable,
  moveInChain,
  normalizeCatalog,
  type ModelCatalog,
} from "../src/lib/model-catalog";

const validCatalog = {
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
      ],
    },
    {
      id: "openai",
      name: "OpenAI",
      availability: "unavailable",
      unavailableReason: "credentials missing (redacted)",
      models: [
        {
          id: "openai/gpt-5",
          name: "GPT-5",
          aliases: ["gpt"],
          capabilities: ["tools"],
        },
      ],
    },
  ],
  fallbackChain: ["anthropic/claude-sonnet-4", "openai/gpt-5"],
  globalDefault: "anthropic/claude-sonnet-4",
};

describe("normalizeCatalog", () => {
  it("accepts a valid catalog and preserves supplied metadata", () => {
    const catalog = normalizeCatalog(validCatalog);
    expect(catalog.providers).toHaveLength(2);
    const first = catalog.providers[0]!;
    const second = catalog.providers[1]!;
    expect(first.models[0]!.pricing).toEqual({ inputPerMillion: 3, outputPerMillion: 15 });
    expect(second.unavailableReason).toBe("credentials missing (redacted)");
  });

  it("rejects duplicate provider-model relationships", () => {
    const raw = {
      providers: [
        {
          id: "a",
          name: "A",
          availability: "available",
          models: [
            { id: "a/m1", name: "M1", aliases: ["m1"], capabilities: [] },
            { id: "a/m1", name: "M1 dup", aliases: ["m1b"], capabilities: [] },
          ],
        },
      ],
      fallbackChain: ["a/m1"],
    };
    expect(() => normalizeCatalog(raw)).toThrow(CatalogValidationError);
    expect(() => normalizeCatalog(raw)).toThrow(/duplicate/);
  });

  it("rejects fallback chains referencing unknown models", () => {
    const raw = { ...validCatalog, fallbackChain: ["nope/missing"] };
    expect(() => normalizeCatalog(raw)).toThrow(/unknown model/);
  });

  it("rejects invalid availability values", () => {
    const raw = structuredClone(validCatalog) as typeof validCatalog;
    (raw.providers[0] as { availability: string }).availability = "sort-of";
    expect(() => normalizeCatalog(raw)).toThrow(/availability/);
  });

  it("rejects malformed model payloads", () => {
    const raw = {
      providers: [
        {
          id: "a",
          name: "A",
          availability: "available",
          models: [{ id: "", name: "M", aliases: [], capabilities: [] }],
        },
      ],
      fallbackChain: [],
    };
    expect(() => normalizeCatalog(raw)).toThrow(CatalogValidationError);
  });

  it("keeps absent pricing absent (never zero)", () => {
    const catalog = normalizeCatalog(validCatalog);
    const gpt5 = catalog.providers[1]!.models[0]!;
    expect(gpt5.pricing).toBeUndefined();
  });

  it("rejects negative or non-finite pricing", () => {
    const raw = structuredClone(validCatalog);
    const model = (raw.providers[0]!.models[0] as unknown as Record<string, unknown>);
    model.pricing = { inputPerMillion: -1 };
    expect(() => normalizeCatalog(raw)).toThrow(/pricing/);
  });
});

describe("selection helpers", () => {
  const catalog: ModelCatalog = normalizeCatalog(validCatalog);

  it("isSelectable follows provider availability", () => {
    expect(isSelectable(catalog, "anthropic/claude-sonnet-4")).toBe(true);
    expect(isSelectable(catalog, "openai/gpt-5")).toBe(false);
    expect(isSelectable(catalog, "missing/model")).toBe(false);
  });

  it("resolves effective model: override > default > chain head", () => {
    expect(resolveEffectiveModel(catalog)).toBe("anthropic/claude-sonnet-4");
    expect(
      resolveEffectiveModel({ ...catalog, sessionOverride: "openai/gpt-5" }),
    ).toBe("openai/gpt-5");
    expect(
      resolveEffectiveModel({ ...catalog, globalDefault: undefined }),
    ).toBe("anthropic/claude-sonnet-4");
  });

  it("moveInChain moves within bounds and no-ops out of bounds", () => {
    const chain = ["a", "b", "c"];
    expect(moveInChain(chain, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInChain(chain, "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveInChain(chain, "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveInChain(chain, "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveInChain(chain, "zzz", 1)).toEqual(chain);
  });
});
