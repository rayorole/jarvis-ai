/**
 * Root-confined file/workspace explorer endpoints (`/api/files*`).
 *
 * Security contract: the server owns the filesystem. Browser-supplied paths
 * are treated as opaque root-relative hints — they are canonicalized and
 * resolved server-side, then re-verified against the approved root after
 * symlink resolution. Traversal, null bytes, symlink escapes, and
 * secret/credential files are rejected or redacted.
 */
import { realpath, readdir, stat } from "node:fs/promises";
import { join, resolve, sep, isAbsolute } from "node:path";
import { Hono } from "hono";

export interface ApprovedRoot {
  /** Stable root id used in URLs. */
  id: string;
  /** Human label. */
  label: string;
  /** Absolute server-side path of the root. */
  path: string;
}

export interface FileNode {
  /** Root-relative canonical path (e.g. "src/index.ts"). */
  path: string;
  name: string;
  type: "file" | "directory";
  size: number | null;
  mtime: string | null;
}

export interface FileListing {
  root: string;
  path: string;
  items: FileNode[];
  truncated: boolean;
}

const MAX_ENTRIES = 500;

/** Files and directories that are never listed or served. */
const BLOCKED_NAMES = new Set([
  ".env", ".env.local", ".env.production", ".git", "node_modules",
  "id_rsa", "id_ed25519", "id_ecdsa", "credentials.json",
  "secrets.json", ".npmrc", ".netrc", ".gitconfig",
]);
const BLOCKED_EXTENSIONS = /\.(pem|key|p12|pfx|keystore|htpasswd)$/i;
const BLOCKED_NAME_SUBSTRINGS = [/credential/i, /secret/i, /password/i, /private[_-]?key/i];

export function isBlockedName(name: string): boolean {
  if (BLOCKED_NAMES.has(name)) return true;
  if (BLOCKED_EXTENSIONS.test(name)) return true;
  return BLOCKED_NAME_SUBSTRINGS.some((re) => re.test(name));
}

/**
 * Validate and normalize a root-relative path supplied by the browser.
 * Rejects absolute paths, traversal segments, null bytes, and NUL-ish
 * control characters. Returns canonical root-relative path ("", ".", or
 * "a/b/c" style).
 */
export function normalizeRelativePath(raw: string): string {
  if (raw.includes("\0")) throw new PathRejectedError("invalid path");
  // Reject percent-encoded traversal attempts before decoding: the browser
  // layer hands us already-decoded strings, but be defensive about both.
  if (/%2e|%2f|%5c/i.test(raw)) throw new PathRejectedError("invalid path");
  if (raw.includes("\\")) throw new PathRejectedError("invalid path");
  if (isAbsolute(raw) || raw.startsWith("/")) throw new PathRejectedError("invalid path");
  const segments = raw.split("/").filter((s) => s !== "" && s !== ".");
  for (const segment of segments) {
    if (segment === "..") throw new PathRejectedError("path traversal rejected");
    if (segment.includes("\0")) throw new PathRejectedError("invalid path");
  }
  return segments.join("/");
}

export class PathRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathRejectedError";
  }
}

export interface FilesApiOptions {
  roots?: ApprovedRoot[];
  maxEntries?: number;
}

function defaultRoots(): ApprovedRoot[] {
  const workspace = resolve(process.cwd(), "..", "..");
  return [{ id: "workspace", label: "Workspace", path: workspace }];
}

export interface FilesApi {
  roots: ApprovedRoot[];
  routes: Hono;
}

export function createFilesApi(options: FilesApiOptions = {}): FilesApi {
  const roots = options.roots ?? defaultRoots();
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;
  const routes = new Hono();

  routes.get("/roots", (c) => {
    return c.json({ items: roots.map(({ id, label }) => ({ id, label })) });
  });

  routes.get("/list", async (c) => {
    const rootId = c.req.query("root") ?? roots[0]?.id ?? "";
    const root = roots.find((r) => r.id === rootId);
    if (root === undefined) return c.json({ error: "unknown root" }, 404);

    let relative: string;
    try {
      relative = normalizeRelativePath(c.req.query("path") ?? "");
    } catch {
      return c.json({ error: "invalid path" }, 400);
    }

    // Resolve server-side, then verify confinement AFTER symlink resolution.
    const claimed = resolve(root.path, relative);
    let resolved: string;
    try {
      resolved = await realpath(claimed);
    } catch {
      return c.json({ error: "path not found" }, 404);
    }
    const resolvedRoot = await realpath(root.path);
    if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + sep)) {
      return c.json({ error: "path outside approved root" }, 403);
    }

    let entries;
    try {
      entries = await (await import("node:fs/promises")).readdir(resolved, { withFileTypes: true });
    } catch {
      return c.json({ error: "not a readable directory" }, 400);
    }

    const items: FileNode[] = [];
    let truncated = false;
    for (const entry of entries) {
      if (isBlockedName(entry.name)) continue;
      if (items.length >= maxEntries) {
        truncated = true;
        break;
      }
      const childRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
      const node: FileNode = { path: childRelative, name: entry.name, type: entry.isDirectory() ? "directory" : "file", size: null, mtime: null };
      if (entry.isFile()) {
        try {
          const stats = await stat(join(resolved, entry.name));
          node.size = stats.size;
          node.mtime = stats.mtime.toISOString();
        } catch {
          // raced/deleted: report without metadata
        }
      }
      items.push(node);
    }
    items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));

    const listing: FileListing = { root: root.id, path: relative, items, truncated };
    return c.json(listing);
  });

  return { roots, routes };
}
