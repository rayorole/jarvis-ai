/**
 * Model/provider catalog normalization and fallback-chain helpers for the
 * model picker (issue #8).
 *
 * Security invariants:
 * - Only redacted, gateway-supplied metadata is accepted; anything malformed
 *   is rejected rather than guessed.
 * - Absent pricing stays absent (null) — never rendered as zero.
 * - No credential values or raw provider configuration ever cross this seam.
 */

export type ProviderAvailability = "available" | "unavailable" | "unknown";

export interface ModelPricing {
  /** Per-million-token input price, when supplied by the gateway. */
  inputPerMillion?: number;
  /** Per-million-token output price, when supplied by the gateway. */
  outputPerMillion?: number;
}

export interface ProviderModel {
  /** Canonical model id, e.g. "anthropic/claude-sonnet-4". */
  id: string;
  /** Human-facing model name. */
  name: string;
  /** Non-empty alias set that resolves to this model. */
  aliases: string[];
  capabilities: string[];
  /** Context window in tokens, when supplied. */
  contextWindow?: number;
  /** Present only when the gateway actually supplies pricing. */
  pricing?: ModelPricing;
}

export interface Provider {
  id: string;
  name: string;
  availability: ProviderAvailability;
  /** Redacted failure reason supplied by the gateway, when present. */
  unavailableReason?: string;
  models: ProviderModel[];
}

export interface ModelCatalog {
  providers: Provider[];
  /** Ordered model ids forming the effective fallback chain. */
  fallbackChain: string[];
  /** Canonical id of the global default model, when set. */
  globalDefault?: string;
  /** Canonical id of the current session override, when set. */
  sessionOverride?: string;
}

export class CatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogValidationError";
  }
}

function requireString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new CatalogValidationError(`${context}: "${key}" must be a non-empty string`);
  }
  return value;
}

function optionalPositiveInt(
  record: Record<string, unknown>,
  key: string,
  context: string,
): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new CatalogValidationError(`${context}: "${key}" must be a positive integer`);
  }
  return value;
}

function optionalPricing(
  record: Record<string, unknown>,
  context: string,
): ModelPricing | undefined {
  const raw = record.pricing;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") {
    throw new CatalogValidationError(`${context}: "pricing" must be an object`);
  }
  const p = raw as Record<string, unknown>;
  const pricing: ModelPricing = {};
  for (const key of ["inputPerMillion", "outputPerMillion"] as const) {
    const value = p[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new CatalogValidationError(`${context}: pricing.${key} must be a finite non-negative number`);
    }
    pricing[key] = value;
  }
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

function normalizeAvailability(value: unknown, context: string): ProviderAvailability {
  if (value === "available" || value === "unavailable" || value === "unknown") return value;
  throw new CatalogValidationError(`${context}: invalid availability ${String(value)}`);
}

function normalizeModel(raw: unknown, providerId: string, seen: Set<string>): ProviderModel {
  if (typeof raw !== "object" || raw === null) {
    throw new CatalogValidationError(`provider ${providerId}: model must be an object`);
  }
  const r = raw as Record<string, unknown>;
  const id = requireString(r, "id", `provider ${providerId} model`);
  const context = `provider ${providerId} model ${id}`;
  if (seen.has(id)) {
    throw new CatalogValidationError(`duplicate provider-model relationship: ${id}`);
  }
  seen.add(id);
  if (!Array.isArray(r.aliases) || r.aliases.some((a) => typeof a !== "string" || a === "")) {
    throw new CatalogValidationError(`${context}: "aliases" must be a non-empty string array`);
  }
  if (!Array.isArray(r.capabilities) || r.capabilities.some((c) => typeof c !== "string")) {
    throw new CatalogValidationError(`${context}: "capabilities" must be a string array`);
  }
  return {
    id,
    name: requireString(r, "name", context),
    aliases: r.aliases as string[],
    capabilities: r.capabilities as string[],
    contextWindow: optionalPositiveInt(r, "contextWindow", context),
    pricing: optionalPricing(r, context),
  };
}

/**
 * Validate and normalize a raw gateway catalog payload. Throws
 * `CatalogValidationError` on malformed or duplicate provider-model
 * relationships — callers must never render unvalidated data.
 */
export function normalizeCatalog(raw: unknown): ModelCatalog {
  if (typeof raw !== "object" || raw === null) {
    throw new CatalogValidationError("catalog must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.providers)) {
    throw new CatalogValidationError('catalog: "providers" must be an array');
  }
  const seen = new Set<string>();
  const providers: Provider[] = r.providers.map((pRaw, index) => {
    const context = `provider[${index}]`;
    if (typeof pRaw !== "object" || pRaw === null) {
      throw new CatalogValidationError(`${context}: must be an object`);
    }
    const p = pRaw as Record<string, unknown>;
    const providerId = requireString(p, "id", context);
    if (!Array.isArray(p.models)) {
      throw new CatalogValidationError(`provider ${providerId}: "models" must be an array`);
    }
    return {
      id: providerId,
      name: requireString(p, "name", context),
      availability: normalizeAvailability(p.availability, `provider ${providerId}`),
      unavailableReason:
        typeof p.unavailableReason === "string" && p.unavailableReason.length > 0
          ? p.unavailableReason
          : undefined,
      models: (p.models as unknown[]).map((m) => normalizeModel(m, providerId, seen)),
    };
  });
  if (!Array.isArray(r.fallbackChain)) {
    throw new CatalogValidationError('catalog: "fallbackChain" must be an array');
  }
  const known = new Set(providers.flatMap((p) => p.models.map((m) => m.id)));
  for (const id of r.fallbackChain) {
    if (typeof id !== "string" || !known.has(id)) {
      throw new CatalogValidationError(`fallback chain references unknown model: ${String(id)}`);
    }
  }
  const fallbackChain = r.fallbackChain as string[];
  const globalDefault =
    r.globalDefault === undefined || r.globalDefault === null
      ? undefined
      : requireString(r, "globalDefault", "catalog");
  const sessionOverride =
    r.sessionOverride === undefined || r.sessionOverride === null
      ? undefined
      : requireString(r, "sessionOverride", "catalog");
  if (globalDefault !== undefined && !known.has(globalDefault)) {
    throw new CatalogValidationError(`global default references unknown model: ${globalDefault}`);
  }
  if (sessionOverride !== undefined && !known.has(sessionOverride)) {
    throw new CatalogValidationError(`session override references unknown model: ${sessionOverride}`);
  }
  return { providers, fallbackChain, globalDefault, sessionOverride };
}

/** True when a model can be selected (its provider is available). */
export function isSelectable(catalog: ModelCatalog, modelId: string): boolean {
  for (const provider of catalog.providers) {
    if (provider.models.some((m) => m.id === modelId)) {
      return provider.availability === "available";
    }
  }
  return false;
}

/** Resolve the effective model for the session: override, else global default, else first chain entry. */
export function effectiveModelId(catalog: ModelCatalog): string | undefined {
  return catalog.sessionOverride ?? catalog.globalDefault ?? catalog.fallbackChain[0];
}

/** Reorder the fallback chain moving `modelId` by +/-1 step, returning a new array. */
export function moveInChain(
  chain: readonly string[],
  modelId: string,
  direction: -1 | 1,
): string[] {
  const index = chain.indexOf(modelId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= chain.length) return [...chain];
  const next = [...chain];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as string);
  return next;
}
