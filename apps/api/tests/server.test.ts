import { describe, it, expect } from "vitest";
import { createApp } from "../src/server";

describe("GET /healthz", () => {
  it("returns ok", async () => {
    const res = await createApp().request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
