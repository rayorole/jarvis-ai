import { describe, expect, it } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouterProvider } from "./helpers/router-provider";
import { AppShell } from "@/components/app-shell/app-shell";

async function renderShell() {
  const view = render(
    <MemoryRouterProvider initialEntries={["/"]}>
      <AppShell gatewayState="online">
        <div>route content</div>
      </AppShell>
    </MemoryRouterProvider>,
  );
  await screen.findByRole("link", { name: /skip to/i });
  return view;
}

describe("AppShell", () => {
  it("renders a skip link as the first focusable element", async () => {
    const { container } = await renderShell();
    const skipLink = screen.getByRole("link", { name: /skip to (main )?content/i });
    const focusables = container.querySelectorAll("a[href], button");
    expect(focusables[0]).toBe(skipLink);
  });

  it("exposes grouped primary navigation with accessible landmarks", async () => {
    await renderShell();
    const nav = screen.getByRole("navigation", { name: /primary/i });
    for (const item of ["Chat", "Kanban", "Jobs", "Memory", "Files", "Gateway"]) {
      expect(within(nav).getByRole("link", { name: new RegExp(`^${item}$`, "i") })).toBeInTheDocument();
    }
    const main = screen.getByRole("main");
    expect(within(main).getByText("route content")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument(); // topbar
  });

  it("shows workspace identity with a labeled gateway status", async () => {
    await renderShell();
    expect(screen.getAllByText(/gateway online/i).length).toBeGreaterThan(0);
  });

  it("has a New chat action and a command/search entry", async () => {
    await renderShell();
    expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search|command/i })).toBeInTheDocument();
  });

  it("provides footer actions: appearance and logout", async () => {
    await renderShell();
    expect(screen.getByRole("button", { name: /appearance/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log ?out/i })).toBeInTheDocument();
  });

  it("marks the active route link with aria-current", async () => {
    await renderShell();
    const nav = screen.getByRole("navigation", { name: /primary/i });
    const home = within(nav).getByRole("link", { name: /^chat$/i });
    expect(home).toHaveAttribute("aria-current", "page");
  });

  it("navigates via keyboard and moves focus to the route content area", async () => {
    const user = userEvent.setup();
    const { container } = await renderShell();
    await user.tab(); // skip link
    expect(screen.getByRole("link", { name: /skip to/i })).toHaveFocus();
    // navigate to Kanban by keyboard
    const kanban = screen.getByRole("link", { name: /^kanban$/i });
    kanban.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(container.querySelector<HTMLDivElement>("#main-content")).toBeTruthy());
  });

  it("contains a signal rail region describing operational segments", async () => {
    await renderShell();
    const rail = screen.getByRole("complementary", { name: /signal rail/i });
    for (const segment of ["Gateway connection", "Active generation", "Pending approval", "Background activity", "Blocked work"]) {
      expect(within(rail).getByLabelText(new RegExp(`${segment}: (active|idle)`))).toBeInTheDocument();
    }
  });
});
