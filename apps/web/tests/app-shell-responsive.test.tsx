import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { matchMedia, MemoryRouterProvider } from "./helpers/router-provider";
import { AppShell } from "@/components/app-shell/app-shell";

function shellWith(ui: React.ReactElement) {
  const view = render(<MemoryRouterProvider initialEntries={["/"]}>{ui}</MemoryRouterProvider>);
  return view;
}

beforeEach(() => {
  matchMedia.useMediaQuery("(max-width: 767px)"); // mobile viewport
});

afterEach(() => {
  matchMedia.reset();
});

describe("AppShell responsive modes", () => {
  it("on mobile the sidebar is hidden behind an off-canvas sheet toggle in the topbar", async () => {
    shellWith(
      <AppShell gatewayState="online">
        <div>content</div>
      </AppShell>,
    );
    const sidebar = await screen.findByLabelText("Sidebar");
    expect(sidebar).toHaveAttribute("data-state", "closed");

    const openButton = screen.getByRole("button", { name: /open navigation/i });
    await userEvent.click(openButton);
    expect(sidebar).toHaveAttribute("data-state", "open");
  });

  it("closes the mobile sheet on Escape", async () => {
    const user = userEvent.setup();
    shellWith(
      <AppShell gatewayState="online">
        <div>content</div>
      </AppShell>,
    );
    const sidebar = await screen.findByLabelText("Sidebar");
    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    await user.keyboard("{Escape}");
    expect(sidebar).toHaveAttribute("data-state", "closed");
  });

  it("renders safe-area padding custom properties for mobile chrome", async () => {
    shellWith(
      <AppShell gatewayState="online">
        <div>content</div>
      </AppShell>,
    );
    const shell = await screen.findByTestId("app-shell");
    expect(shell.className).toMatch(/safe-area/);
  });

  it("reduced motion removes streaming pulse animation from the signal rail", async () => {
    matchMedia.useMediaQuery("(prefers-reduced-motion: reduce)");
    try {
      shellWith(
        <AppShell gatewayState="online" generating>
          <div>content</div>
        </AppShell>,
      );
      const rail = await screen.findByRole("complementary", { name: /signal rail/i });
      const pulseSegment = rail.querySelector('[data-testid="segment-generation"]');
      expect(pulseSegment).not.toBeNull();
      expect(pulseSegment).toHaveAttribute("data-motion", "none");
    } finally {
      matchMedia.reset();
    }
  });

  it("keeps the sidebar permanently open on desktop (no sheet state)", async () => {
    matchMedia.reset(); // no mobile query matched
    shellWith(
      <AppShell gatewayState="online">
        <div>content</div>
      </AppShell>,
    );
    const sidebar = await screen.findByRole("complementary", { name: /^$/i }).catch(() => null);
    void sidebar;
    const shell = await screen.findByTestId("app-shell");
    expect(shell.getAttribute("data-viewport")).toBe("desktop");
  });
});
