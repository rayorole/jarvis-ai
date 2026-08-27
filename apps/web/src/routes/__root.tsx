import { createRootRoute, Outlet, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout(): ReactNode {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <Outlet />
    </div>
  );
}
