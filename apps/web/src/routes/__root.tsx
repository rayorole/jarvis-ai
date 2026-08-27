import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell, type GatewayState } from "../components/app-shell/app-shell";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout(): ReactNode {
  // Issue #15 will feed live gateway/HUD state through slots.
  const gatewayState: GatewayState = "unknown";
  return (
    <AppShell gatewayState={gatewayState}>
      <Outlet />
    </AppShell>
  );
}

export function NotFound() {
  return (
    <section aria-labelledby="nf-title">
      <h2 id="nf-title">Page not found</h2>
      <p>The page you requested does not exist.</p>
      <Link to="/">Back to Chat</Link>
    </section>
  );
}
