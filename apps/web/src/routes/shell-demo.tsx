import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell/app-shell";

export const Route = createFileRoute("/shell-demo")({
  component: ShellDemo,
});

/**
 * Story/demo route required by issue #5 acceptance criteria:
 * shows the shared shell in light and dark contexts.
 */
function ShellDemo() {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section data-theme="light" aria-label="Light theme story">
        <h2>Light</h2>
        <AppShell title="Shell demo — light" gatewayState="online" generating>
          <p>Shared shell primitives in the light context.</p>
        </AppShell>
      </section>
      <section data-theme="dark" aria-label="Dark theme story">
        <h2>Dark</h2>
        <AppShell title="Shell demo — dark" gatewayState="degraded" pendingApprovals={2}>
          <p>Shared shell primitives in the dark context.</p>
        </AppShell>
      </section>
    </div>
  );
}
