import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createSessionsApi } from "./sessions/index.js";
import { createFilesApi } from "./files/index.js";

export function createApp() {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.route("/api/sessions", createSessionsApi().routes);
  app.route("/api/files", createFilesApi().routes);

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4000);
  serve({ fetch: createApp().fetch, port });
  console.log(`api listening on :${port}`);
}
