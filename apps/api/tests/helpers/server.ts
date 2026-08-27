/**
 * Test harness: supertest's request(app.fetch) hangs in this environment
 * (it expects a node http handler / server URL), so we boot the Hono app on a
 * real loopback listener via @hono/node-server and exercise it over HTTP —
 * a more faithful public-seam test anyway.
 */
import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import type { AddressInfo } from "node:net";

export async function startTestServer(app: Hono): Promise<{
  base: string;
  close(): Promise<void>;
}> {
  const server = serve({ fetch: app.fetch, port: 0 });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
