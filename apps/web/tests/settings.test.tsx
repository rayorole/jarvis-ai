import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouterProvider } from "./helpers/router-provider";
import { SettingsPage } from "../src/components/settings/settings";

function renderSettings() {
  return render(
    <MemoryRouterProvider initialEntries={["/settings"]}>
      <SettingsPage />
    </MemoryRouterProvider>,
  );
}

describe("settings page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-density");
  });

  it("shows current theme and density controls", async () => {
    renderSettings();
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Density" })).toBeInTheDocument();
  });

  it("applies the chosen theme to the document and persists it", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole("radio", { name: /dark/i }));
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
    expect(window.localStorage.getItem("jarvis.preferences")).toContain('"theme":"dark"');
});

  it("applies the chosen density and persists it", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole("radio", { name: /compact/i }));
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    });
    expect(window.localStorage.getItem("jarvis.preferences")).toContain('"density":"compact"');
  });

  it("restores saved preferences on mount", async () => {
    window.localStorage.setItem(
      "jarvis.preferences",
      JSON.stringify({ theme: "dark", density: "compact" }),
    );
    renderSettings();
    expect(await screen.findByRole("radio", { name: /dark/i })).toBeChecked();
    expect(await screen.findByRole("radio", { name: /compact/i })).toBeChecked();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });
});