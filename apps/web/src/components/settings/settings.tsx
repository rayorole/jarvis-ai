/**
 * User preferences (issue #15): theme + density, wired to the design-token
 * system in `styles/tokens.css` via data-attributes on <html>, persisted to
 * localStorage so choices survive reloads.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark";
export type Density = "default" | "compact";

const STORAGE_KEY = "jarvis.preferences";

export interface Preferences {
  theme: Theme;
  density: Density;
}

export const DEFAULT_PREFERENCES: Preferences = { theme: "light", density: "default" };

/** Reads persisted preferences without applying them (safe on server/SSR paths). */
export function readStoredPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  return readStored();
}

function readStored(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    const theme = parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).theme;
    const density =
      parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).density;
    return {
      theme: theme === "dark" ? "dark" : "light",
      density: density === "compact" ? "compact" : "default",
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Applies preferences to the design-token system (data-theme / data-density). */
export function applyPreferences(prefs: Preferences): void {
  document.documentElement.setAttribute("data-theme", prefs.theme);
  document.documentElement.setAttribute("data-density", prefs.density);
}

function persist(prefs: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private mode etc.) — preferences stay session-local.
  }
}

const THEME_OPTIONS: Array<{ value: Theme; label: string; description: string }> = [
  { value: "light", label: "Light", description: "Light surfaces" },
  { value: "dark", label: "Dark", description: "Dark surfaces" },
];

const DENSITY_OPTIONS: Array<{ value: Density; label: string; description: string }> = [
  { value: "default", label: "Default", description: "Comfortable spacing" },
  { value: "compact", label: "Compact", description: "Tighter row spacing" },
];

export function SettingsPage(): ReactNode {
  const [prefs, setPrefs] = useState<Preferences>(() => readStored());

  useEffect(() => {
    applyPreferences(prefs);
    persist(prefs);
  }, [prefs]);

  return (
    <section aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>

      <fieldset role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((opt) => (
          <label key={opt.value}>
            <input
              type="radio"
              name="theme"
              value={opt.value}
              checked={prefs.theme === opt.value}
              onChange={() => setPrefs((p) => ({ ...p, theme: opt.value }))}
            />
            <span>{opt.label}</span>
            <span className="settings-option-description">{opt.description}</span>
          </label>
        ))}
      </fieldset>

      <fieldset role="radiogroup" aria-label="Density">
        {DENSITY_OPTIONS.map((opt) => (
          <label key={opt.value}>
            <input
              type="radio"
              name="density"
              value={opt.value}
              checked={prefs.density === opt.value}
              onChange={() => setPrefs((p) => ({ ...p, density: opt.value }))}
            />
            <span>{opt.label}</span>
            <span className="settings-option-description">{opt.description}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}