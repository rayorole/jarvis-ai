import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { AppShell, type GatewayState } from "../components/app-shell/app-shell";
import { applyPreferences, readStoredPreferences } from "../components/settings/settings";

export const Route = createRootRoute({
  component: RootDocument,
});

function RootDocument(): ReactNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Jarvis</title>
        <HeadContent />
      </head>
      <body>
        <RootLayout />
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout(): ReactNode {
  // Issue #15 will feed live gateway/HUD state through slots.
  const gatewayState: GatewayState = "unknown";
  // Restore persisted theme/density before first paint of the shell.
  useEffect(() => {
    applyPreferences(readStoredPreferences());
  }, []);
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
