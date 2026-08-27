import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultNotFoundComponent: () => (
      <section aria-labelledby="nf-title">
        <h2 id="nf-title">Page not found</h2>
        <p>The page you requested does not exist.</p>
      </section>
    ),
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
