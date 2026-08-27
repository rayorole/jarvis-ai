import { Hono } from "hono";
import { serve } from "@hono/node-server";

export function createApp() {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4000);
  serve({ fetch: createApp().fetch, port });
  console.log(`api listening on :${port}`);
}
