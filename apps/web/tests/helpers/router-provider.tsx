import { vi } from "vitest";
import type { ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

const ROUTE_PATHS = ["/", "/chat", "/kanban", "/jobs", "/memory", "/files", "/gateway", "/settings"] as const;

/**
 * Test helper: mounts children under a real TanStack Router instance with
 * memory history so link components behave like production navigation.
 * The router resolves asynchronously, so tests should await findBy* queries
 * or waitFor before asserting.
 */
export function MemoryRouterProvider({ initialEntries, children }: { initialEntries: string[]; children?: ReactNode }) {
  function Shell() {
    return (
      <>
        <Outlet />
      </>
    );
  }
  const rootRoute = createRootRoute({ component: Shell });
  const routes = ROUTE_PATHS.map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <>{children}</>,
    }),
  );
  const routeTree = rootRoute.addChildren(routes);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries }),
    defaultNotFoundComponent: () => <>{children}</>,
  });
  return <RouterProvider router={router} />;
}

const activeQueries = new Map<string, boolean>();

/** Deterministic matchMedia stub. useMediaQuery(q) makes q match; reset clears. */
export const matchMedia = {
  useMediaQuery(query: string) {
    activeQueries.set(query, true);
  },
  reset() {
    activeQueries.clear();
  },
};

let installed = false;

/** Idempotently installs the window.matchMedia stub for jsdom. */
export function installMatchMediaStub(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (media: string) => ({
      matches: activeQueries.get(media) ?? false,
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}
