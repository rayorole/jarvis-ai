import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ModelCatalog, Provider } from "../lib/model-catalog";
import { useModelPicker, type UseModelPickerOptions } from "../lib/use-model-picker";

/**
 * Searchable, keyboard-operable model picker for the chat topbar (issue #8).
 *
 - Grouped by provider, models searchable by name/alias.
 - Session override and global default are visually distinct.
 - Unavailable/unknown provider states are rendered and not selectable.
 - Effective ordered fallback chain is displayed with accessible move controls.
 - Never renders credential values, raw provider configuration, or absent
   pricing as zero.
 */

export interface ModelPickerProps {
  options?: UseModelPickerOptions;
}

const AVAILABILITY_LABEL: Record<Provider["availability"], string> = {
  available: "",
  unavailable: "unavailable",
  unknown: "availability unknown",
};

function matchesQuery(
  catalog: ModelCatalog,
  modelId: string,
  query: string,
): boolean {
  if (query === "") return true;
  const needle = query.toLowerCase();
  for (const provider of catalog.providers) {
    for (const model of provider.models) {
      if (model.id !== modelId) continue;
      return (
        model.name.toLowerCase().includes(needle) ||
        model.id.toLowerCase().includes(needle) ||
        model.aliases.some((a) => a.toLowerCase().includes(needle))
      );
    }
  }
  return false;
}

export function ModelPicker({ options }: ModelPickerProps) {
  const picker = useModelPicker(options);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const visibleProviders = useMemo(() => {
    if (picker.catalog === null) return [];
    return picker.catalog.providers
      .map((provider) => ({
        provider,
        models: provider.models.filter((m) => matchesQuery(picker.catalog as ModelCatalog, m.id, query)),
      }))
      .filter((entry) => entry.models.length > 0);
  }, [picker.catalog, query]);

  if (picker.status === "loading") {
    return <div role="status">Loading models…</div>;
  }
  if (picker.status === "error") {
    return (
      <div role="alert" data-testid="picker-error">
        Failed to load models: {picker.error}
      </div>
    );
  }

  const catalog = picker.catalog as ModelCatalog;
  const sessionOverride = catalog.sessionOverride;
  const globalDefault = catalog.globalDefault;
  const effectiveId = picker.effectiveModelId;
  const selectedModelName =
    effectiveId !== undefined
      ? catalog.providers.flatMap((p) => p.models).find((m) => m.id === effectiveId)?.name ?? effectiveId
      : "No model selected";

  return (
    <div ref={rootRef} className="model-picker">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        data-testid="picker-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        {selectedModelName}
        {sessionOverride !== undefined ? (
          <span data-testid="session-override-badge">session</span>
        ) : (
          <span data-testid="global-default-badge">default</span>
        )}
      </button>
      {actionError !== null && (
        <div role="alert" data-testid="picker-action-error">
          {actionError}
        </div>
      )}
      {open && (
        <div data-testid="picker-popover">
          <input
            type="search"
            role="searchbox"
            aria-label="Search models"
            placeholder="Search models…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {visibleProviders.length === 0 ? (
            <div data-testid="picker-empty">No models match your search.</div>
          ) : (
            <ul role="listbox" id={listboxId} aria-label="Models">
              {visibleProviders.map(({ provider, models }) => (
                <li key={provider.id}>
                  <span data-testid={`provider-${provider.id}`}>
                    {provider.name}
                    {AVAILABILITY_LABEL[provider.availability] !== "" && (
                      <span data-testid={`provider-${provider.id}-availability`}>
                        {" "}
                        ({AVAILABILITY_LABEL[provider.availability]}
                        {provider.availability === "unavailable" && provider.unavailableReason
                          ? `: ${provider.unavailableReason}`
                          : ""}
                        )
                      </span>
                    )}
                  </span>
                  <ul role="group" aria-label={`${provider.name} models`}>
                    {models.map((model) => {
                      const selectable = provider.availability === "available";
                      const isSession = sessionOverride === model.id;
                      const isDefault = globalDefault === model.id;
                      return (
                        <li key={model.id} role="option" aria-selected={effectiveId === model.id}>
                          <button
                            type="button"
                            data-testid={`model-option-${model.id}`}
                            data-available={selectable}
                            disabled={!selectable}
                            onClick={() => {
                              setActionError(null);
                              picker
                                .setSessionModel(model.id)
                                .then(() => setOpen(false))
                                .catch((err: unknown) =>
                                  setActionError(
                                    err instanceof Error ? err.message : "failed to set model",
                                  ),
                                );
                            }}
                          >
                            {model.name}
                            {isSession && <span data-testid={`badge-session-${model.id}`}> (session)</span>}
                            {isDefault && <span data-testid={`badge-default-${model.id}`}> (global default)</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <section aria-label="Fallback chain">
        <h3>Fallback chain</h3>
        <ol data-testid="fallback-chain">
          {catalog.fallbackChain.map((modelId, index) => (
            <li key={modelId} data-testid={`chain-item-${modelId}`}>
              <span>{modelId}</span>
              <button
                type="button"
                data-testid={`move-up-${modelId}`}
                aria-label={`Move ${modelId} up in fallback order`}
                disabled={index === 0}
                onClick={() => {
                  setActionError(null);
                  picker
                    .moveFallback(modelId, -1)
                    .catch((err: unknown) =>
                      setActionError(err instanceof Error ? err.message : "failed to reorder"),
                    );
                }}
              >
                ↑
              </button>
              <button
                type="button"
                data-testid={`move-down-${modelId}`}
                aria-label={`Move ${modelId} down in fallback order`}
                disabled={index === catalog.fallbackChain.length - 1}
                onClick={() => {
                  setActionError(null);
                  picker
                    .moveFallback(modelId, 1)
                    .catch((err: unknown) =>
                      setActionError(err instanceof Error ? err.message : "failed to reorder"),
                    );
                }}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
