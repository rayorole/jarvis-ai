/**
 * File explorer endpoint tests. Security contract: only the pre-approved
 * temporary roots are browsable; traversal, symlink escapes, and secret
 * files are rejected or redacted.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createFilesApi, isBlockedName, normalizeRelativePath, PathRejectedError } from "../src/files/index.js";

let rootA: string;
let rootB: string;
let app: Hono;

async function makeRoot(structure: Record<string, string | null>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-files-"));
  for (const [rel, content] of Object.entries(structure)) {
    const abs = join(dir, rel);
    if (content === null) {
      await mkdir(abs, { recursive: true });
    } else {
      const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ".";
      await mkdir(join(dir, parent), { recursive: true });
      await writeFile(abs, content);
    }
  }
  return dir;
}

beforeAll(async () => {
  rootA = await makeRoot({
    "README.md": "hello",
    "src": null,
    "src/index.ts": "export {};\n",
    ".env": "SECRET_TOKEN=abc\n",
    "keys.pem": "-----BEGIN PRIVATE KEY-----\n",
    "credentials.json": "{}",
  });
  rootB = await makeRoot({ "b-file.txt": "B" });

  const files = createFilesApi({
    roots: [
      { id: "root-a", label: "Root A", path: rootA },
      { id: "root-b", label: "Root B", path: rootB },
    ],
  });
  app = new Hono();
  app.route("/api/files", files.routes);
});

afterAll(async () => {
  await rm(rootA, { recursive: true, force: true });
  await rm(rootB, { recursive: true, force: true });
});

function get(url: string) {
  return app.request(url);
}

interface Item {
  name: string;
  type: "file" | "directory";
  size: number | null;
}

describe("normalizeRelativePath", () => {
  it("accepts plain relative segments", () => {
    expect(normalizeRelativePath("src/index.ts")).toBe("src/index.ts");
    expect(normalizeRelativePath("")).toBe("");
    expect(normalizeRelativePath("./src")).toBe("src");
  });

  it("rejects traversal, absolute paths, null bytes, and encoded traversal", () => {
    expect(() => normalizeRelativePath("../etc/passwd")).toThrow(PathRejectedError);
    expect(() => normalizeRelativePath("src/../../etc")).toThrow(PathRejectedError);
    expect(() => normalizeRelativePath("/etc/passwd")).toThrow(PathRejectedError);
    expect(() => normalizeRelativePath("src\0/x")).toThrow(PathRejectedError);
    expect(() => normalizeRelativePath("%2e%2e/etc")).toThrow(PathRejectedError);
    expect(() => normalizeRelativePath("src\\x")).toThrow(PathRejectedError);
  });
});

describe("isBlockedName", () => {
  it("blocks secret and credential files", () => {
    expect(isBlockedName(".env")).toBe(true);
    expect(isBlockedName("id_rsa")).toBe(true);
    expect(isBlockedName("keys.pem")).toBe(true);
    expect(isBlockedName("credentials.json")).toBe(true);
    expect(isBlockedName("my-passwords.txt")).toBe(true);
    expect(isBlockedName("README.md")).toBe(false);
    expect(isBlockedName("src")).toBe(false);
  });
});

describe("GET /api/files/list", () => {
  it("lists root entries with secret files redacted", async () => {
    const res = await get("/api/files/list?root=root-a");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Item[] };
    const names = body.items.map((i) => i.name);
    expect(names).toContain("README.md");
    expect(names).toContain("src");
    expect(names).not.toContain(".env");
    expect(names).not.toContain("keys.pem");
    expect(names).not.toContain("credentials.json");
  });

  it("lists a subdirectory with file metadata", async () => {
    const res = await get("/api/files/list?root=root-a&path=src");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Item[] };
    expect(body.items).toHaveLength(1);
    const file = body.items[0]!;
    expect(file.name).toBe("index.ts");
    expect(file.type).toBe("file");
    expect(file.size).toBeGreaterThan(0);
  });

  it("sorts directories before files", async () => {
    const res = await get("/api/files/list?root=root-a");
    const body = (await res.json()) as { items: Item[] };
    const firstDir = body.items.findIndex((i) => i.type === "directory");
    const firstFile = body.items.findIndex((i) => i.type === "file");
    expect(firstDir).toBeLessThan(firstFile);
  });

  it("returns 404 for unknown root", async () => {
    const res = await get("/api/files/list?root=nope");
    expect(res.status).toBe(404);
  });

  it("returns 404 for missing directory", async () => {
    const res = await get("/api/files/list?root=root-a&path=does-not-exist");
    expect(res.status).toBe(404);
  });

  it("rejects traversal with 400", async () => {
    const res = await get(`/api/files/list?root=root-a&path=${encodeURIComponent("../")}`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid path");
  });

  it("rejects encoded traversal with 400", async () => {
    const res = await get("/api/files/list?root=root-a&path=%2e%2e");
    expect(res.status).toBe(400);
  });

  it("rejects absolute paths with 400", async () => {
    const res = await get("/api/files/list?root=root-a&path=" + encodeURIComponent("/etc"));
    expect(res.status).toBe(400);
  });

  it("rejects null bytes with 400", async () => {
    const res = await get("/api/files/list?root=root-a&path=" + encodeURIComponent("src\0"));
    expect(res.status).toBe(400);
  });

  it("confines symlinked directories outside the root", async () => {
    await symlink("/etc", join(rootA, "evil-escape"));
    const res = await get("/api/files/list?root=root-a&path=evil-escape");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("path outside approved root");
  });

  it("exposes approved roots", async () => {
    const res = await get("/api/files/roots");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; label: string }> };
    expect(body.items).toEqual([
      { id: "root-a", label: "Root A" },
      { id: "root-b", label: "Root B" },
    ]);
  });
});
