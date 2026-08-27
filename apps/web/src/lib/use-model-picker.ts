import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  effectiveModelId,
  isSelectable,
  moveInChain,
  normalizeCatalog,
  type ModelCatalog,
} from "./model-catalog";

/** Where the gateway serves the model catalog and accepts mutations. */
export const CATALOG_PATH = "/api/gateway/models";
export const SESSION_MODEL_PATH = "/api/gateway/session/model";
export const DEFAULT_CHAIN_PATH = "/api/gateway/defaults/fallback-chain";

export class ModelPickerError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "ModelPickerError";
  }
}

export interface ModelPickerFetch {
  (url: string, init: RequestInit): Promise<Response>;
}

export interface UseModelPickerOptions {
  fetchImpl?: ModelPickerFetch;
}

export type PickerStatus = "loading" | "ready" | "error";

export interface UseModelPickerResult {
  status: PickerStatus;
  catalog: ModelCatalog | null;
  error: string | null;
  /** Canonical id of the model the session would currently use. */
  effectiveModelId: string | undefined;
  isModelSelectable: (modelId: string) => boolean;
  /** Set the session model override via a canonical gateway mutation. */
  setSessionModel: (modelId: string) => Promise<void>;
  /** Move a model in the global fallback chain via a canonical mutation. */
  moveFallback: (modelId: string, direction: -1 | 1) => Promise<void>;
  /** Reconcile optimistic state back to the last server-known state. */
  reconcile: () => void;
}

async function readErrorBody(response: Response, fallback: string): Promise<ModelPickerError> {
  let code = String(response.status);
  let message = fallback;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.code === "string") code = body.code;
    if (typeof body.message === "string") message = body.message;
  } catch {
    // keep defaults
  }
  return new ModelPickerError(message, code);
}

/**
 * Loads and normalizes the model catalog from the gateway and exposes
 * canonical mutations for the session model and the global fallback chain.
 *
 * Mutations are optimistic with rollback: UI state is updated immediately and
 * reconciled back to server state on failure (reorder conflicts roll back).
 */
export function useModelPicker(options: UseModelPickerOptions = {}): UseModelPickerResult {
  const doFetch = options.fetchImpl ?? fetch;
  const [status, setStatus] = useState<PickerStatus>("loading");
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Partial<ModelCatalog> | null>(null);
  // Last catalog state that the server confirmed (used for rollback).
  const serverStateRef = useRef<ModelCatalog | null>(null);
  const fetchRef = useRef(doFetch);
  fetchRef.current = doFetch;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetchRef.current(CATALOG_PATH, {
          method: "GET",
          headers: { accept: "application/json" },
          credentials: "same-origin",
        });
        if (!response.ok) {
          throw await readErrorBody(response, "failed to load model catalog");
        }
        const normalized = normalizeCatalog(await response.json());
        if (cancelled) return;
        serverStateRef.current = normalized;
        setCatalog(normalized);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "failed to load model catalog");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo<ModelCatalog | null>(() => {
    if (catalog === null) return null;
    if (optimistic === null) return catalog;
    return { ...catalog, ...optimistic };
  }, [catalog, optimistic]);

  const reconcile = useCallback(() => {
    setOptimistic(null);
    setCatalog(serverStateRef.current);
  }, []);

  const setSessionModel = useCallback(
    async (modelId: string) => {
      const previous = serverStateRef.current;
      setOptimistic({ sessionOverride: modelId });
      try {
        const response = await fetchRef.current(SESSION_MODEL_PATH, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ modelId }),
          credentials: "same-origin",
        });
        if (!response.ok) throw await readErrorBody(response, "failed to set session model");
        const confirmed = normalizeCatalog(await response.json());
        serverStateRef.current = confirmed;
        setOptimistic(null);
        setCatalog(confirmed);
      } catch (err) {
        // Roll back to the last server-confirmed state (reorder conflict or failure).
        setOptimistic(null);
        setCatalog(previous);
        throw err;
      }
    },
    [],
  );

  const moveFallback = useCallback(
    async (modelId: string, direction: -1 | 1) => {
      const previous = serverStateRef.current;
      if (previous === null) return;
      const nextChain = moveInChain(previous.fallbackChain, modelId, direction);
      if (nextChain === previous.fallbackChain) return;
      setOptimistic({ fallbackChain: nextChain });
      try {
        const response = await fetchRef.current(DEFAULT_CHAIN_PATH, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fallbackChain: nextChain }),
          credentials: "same-origin",
        });
        if (!response.ok) throw await readErrorBody(response, "failed to update fallback chain");
        const confirmed = normalizeCatalog(await response.json());
        serverStateRef.current = confirmed;
        setOptimistic(null);
        setCatalog(confirmed);
      } catch (err) {
        // Conflict/failure: roll back and reconcile with server state.
        setOptimistic(null);
        setCatalog(previous);
        throw err;
      }
    },
    [],
  );

  const isModelSelectable = useCallback(
    (modelId: string) => (view === null ? false : isSelectable(view, modelId)),
    [view],
  );

  return {
    status,
    catalog: view,
    error,
    effectiveModelId: view === null ? undefined : effectiveModelId(view),
    isModelSelectable,
    setSessionModel,
    moveFallback,
    reconcile,
  };
}
