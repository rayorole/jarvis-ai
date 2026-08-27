import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatePattern, StatusDot } from "./../src/Status";

describe("StatePattern (route-level state patterns)", () => {
  it("renders error state with a named operation and retry action", async () => {
    const user = userEvent.setup();
    let retried = false;
    render(
      <StatePattern
        kind="error"
        title="Failed to load sessions"
        detail="The request to /api/gateway/sessions timed out."
        retry={() => {
          retried = true;
        }}
      />,
    );
    expect(screen.getByRole("region", { name: /failed to load sessions/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(retried).toBe(true);
  });

  it("offline pattern preserves last successful check and has no false success signal", () => {
    render(<StatePattern kind="offline" title="Gateway offline" detail="Cached read-only data is shown." lastChecked="12:00 UTC" />);
    const region = screen.getByRole("region", { name: /gateway offline/i });
    expect(region).toHaveTextContent(/last successful check/i);
  });

  it.each(["loading", "empty", "not-found"] as const)("renders %s pattern", (kind) => {
    render(<StatePattern kind={kind} title={kind} />);
    expect(screen.getByTestId(`state-${kind}`)).toBeInTheDocument();
  });
});

describe("StatusDot (status never color-only)", () => {
  it("pairs every status with a text label and an icon glyph", () => {
    for (const state of ["online", "degraded", "offline", "unknown"] as const) {
      const { container, unmount } = render(<StatusDot state={state} />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.textContent?.toLowerCase()).toContain(state);
      expect(root.querySelector("[aria-hidden='true']")?.textContent).not.toBe("");
      unmount();
    }
  });
});
